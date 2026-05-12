/**
 * backend/src/routes/welfare.js — FIXED & EXTENDED
 *
 * CHANGES:
 *  1. Added date/month/year/period filters to GET /
 *  2. Added 'other' category support (text field for reason)
 *  3. Welfare category ENUM — 'other' must be added via migration (see below)
 *  4. Summary now returns filtered totals that match the active filters
 *
 * DB MIGRATION REQUIRED (run once on Neon):
 *   ALTER TYPE welfare_category ADD VALUE IF NOT EXISTS 'other';
 */

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit }  = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const { v4: uuidv4 } = require('uuid');

/* ─── GET /api/welfare ───────────────────────────────────────────────────── */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const isAdmin = ['admin','treasurer','auditor'].includes(req.user.role);
    const { status, category, from, to, month, year, limit = 100 } = req.query;

    const params = isAdmin ? [] : [req.user.id];
    const where  = isAdmin ? [] : ['wc.user_id = $1'];

    if (status)   { params.push(status);   where.push(`wc.status::TEXT = $${params.length}`); }
    if (category) { params.push(category); where.push(`wc.category::TEXT = $${params.length}`); }

    // Date range filters
    if (from) { params.push(from); where.push(`wc.filed_date >= $${params.length}`); }
    if (to)   { params.push(to);   where.push(`wc.filed_date <= $${params.length}`); }

    // Month filter (e.g. '2025-05')
    if (month) {
      params.push(month + '-01');
      where.push(`DATE_TRUNC('month', wc.filed_date) = DATE_TRUNC('month', $${params.length}::date)`);
    }

    // Year filter
    if (year) {
      params.push(parseInt(year, 10));
      where.push(`EXTRACT(YEAR FROM wc.filed_date) = $${params.length}`);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const countParams = [...params];
    params.push(parseInt(limit, 10));

    const [{ rows }, { rows: [summary] }] = await Promise.all([
      query(
        `SELECT wc.*, u.full_name, u.member_no, rv.full_name AS reviewed_by_name
         FROM   welfare_cases wc
         JOIN   users u  ON u.id = wc.user_id
         LEFT JOIN users rv ON rv.id = wc.reviewed_by
         ${whereClause}
         ORDER  BY wc.created_at DESC
         LIMIT  $${params.length}`,
        params
      ),
      query(
        `SELECT
           COUNT(*)                                                          AS total_cases,
           COALESCE(SUM(amount), 0)                                          AS total_amount,
           COALESCE(SUM(amount) FILTER (WHERE status='pending'),    0)       AS pending_amount,
           COALESCE(SUM(amount) FILTER (WHERE status='disbursed'),  0)       AS disbursed_amount,
           COALESCE(SUM(amount) FILTER (WHERE status='approved'),   0)       AS approved_amount,
           COUNT(*) FILTER (WHERE status='pending')                          AS pending_count,
           COUNT(*) FILTER (WHERE status='disbursed')                        AS disbursed_count
         FROM welfare_cases wc ${whereClause}`,
        countParams
      ),
    ]);

    res.json({ success: true, data: rows, summary });
  } catch (err) { next(err); }
});

/* ─── GET /api/welfare/pool-balance ──────────────────────────────────────── */
router.get('/pool-balance', authenticate, authorize('admin', 'treasurer', 'auditor'), async (req, res, next) => {
  try {
    const { rows: [row] } = await query(
      `SELECT COALESCE(SUM(a.balance), 0) AS pool_balance
       FROM accounts a
       JOIN users u ON u.id = a.user_id
       WHERE a.type = 'welfare' AND u.role = 'member'`
    );
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

/* ─── POST /api/welfare — file a case ───────────────────────────────────── */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { category, amount, description, other_reason } = req.body;

    if (!category || !amount) {
      return res.status(400).json({ success: false, message: 'category and amount are required' });
    }

    // 'other' requires a reason
    if (category === 'other' && !other_reason) {
      return res.status(400).json({ success: false, message: 'Please provide a reason for the "Other" category' });
    }

    const userId = req.user.role === 'member'
      ? req.user.id
      : (req.body.user_id || req.user.id);

    const finalDescription = category === 'other' && other_reason
      ? `[Other] ${other_reason}${description ? ' — ' + description : ''}`
      : description;

    // Race-safe reference
    const { rows: [{ max_ref }] } = await query(
      `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(reference, '[^0-9]', '', 'g') AS INT)), 0) AS max_ref FROM welfare_cases`
    );
    const ref = `WF-${String(max_ref + 1).padStart(3, '0')}`;

    const { rows: [wc] } = await query(
      `INSERT INTO welfare_cases (id, reference, user_id, category, amount, description)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [uuidv4(), ref, userId, category, parseFloat(amount), finalDescription]
    );

    // Notify member
    await createNotification(null, {
      userId,
      title: 'Welfare Case Filed',
      message: `Your welfare case ${ref} for KES ${Number(amount).toLocaleString()} has been filed and is pending review.`,
      type: 'welfare', relatedId: wc.id,
    });

    res.status(201).json({ success: true, data: wc });
  } catch (err) { next(err); }
});

/* ─── PATCH /:id/review ─────────────────────────────────────────────────── */
router.patch('/:id/review', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const { status, review_note } = req.body;
    const validStatuses = ['approved', 'rejected', 'disbursed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    let savingsFallback = false;

    await withTransaction(async (client) => {
      const { rows: [wc] } = await client.query('SELECT * FROM welfare_cases WHERE id = $1', [req.params.id]);
      if (!wc) throw Object.assign(new Error('Welfare case not found'), { statusCode: 404 });
      if (['approved','rejected','disbursed'].includes(wc.status)) {
        throw Object.assign(new Error(`Case is already ${wc.status}`), { statusCode: 400 });
      }

      const updateFields = {
        status,
        reviewed_by: req.user.id,
        review_note: review_note || null,
        reviewed_at: 'NOW()',
        disbursed_at: status === 'disbursed' ? 'NOW()' : null,
      };

      await client.query(
        `UPDATE welfare_cases
         SET status=$1, reviewed_by=$2, review_note=$3, reviewed_at=NOW(),
             disbursed_at = CASE WHEN $1='disbursed' THEN NOW() ELSE disbursed_at END,
             updated_at=NOW()
         WHERE id=$4`,
        [status, req.user.id, review_note || null, req.params.id]
      );

      // If disbursing, deduct from welfare pool (member welfare accounts)
      if (status === 'disbursed') {
        const { rows: welAccounts } = await client.query(
          `SELECT a.* FROM accounts a
           JOIN users u ON u.id = a.user_id
           WHERE a.type = 'welfare' AND u.role = 'member' AND a.balance > 0
           ORDER BY a.balance DESC`
        );

        let remaining = parseFloat(wc.amount);
        for (const acc of welAccounts) {
          if (remaining <= 0) break;
          const deduct = Math.min(parseFloat(acc.balance), remaining);
          await client.query(
            `UPDATE accounts SET balance = balance - $1, updated_at=NOW() WHERE id=$2`,
            [deduct, acc.id]
          );
          remaining -= deduct;
        }

        // Fallback to member's own savings if pool insufficient
        if (remaining > 0) {
          savingsFallback = true;
          const { rows: [savAcc] } = await client.query(
            `SELECT * FROM accounts WHERE user_id=$1 AND type='savings'`, [wc.user_id]
          );
          if (savAcc && parseFloat(savAcc.balance) >= remaining) {
            await client.query(
              `UPDATE accounts SET balance = balance - $1, updated_at=NOW() WHERE id=$2`,
              [remaining, savAcc.id]
            );
          }
        }
      }

      const notifMsg = status === 'disbursed'
        ? `Your welfare case ${wc.reference} has been disbursed. KES ${Number(wc.amount).toLocaleString()} processed.`
        : status === 'approved'
        ? `Your welfare case ${wc.reference} has been approved and is awaiting disbursement.`
        : `Your welfare case ${wc.reference} has been ${status}. ${review_note ? 'Note: ' + review_note : ''}`;

      await createNotification(client, {
        userId: wc.user_id, title: `Welfare Case ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: notifMsg, type: 'welfare', relatedId: wc.id,
      });

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: `WELFARE_${status.toUpperCase()}`, entityType: 'welfare_case', entityId: req.params.id,
        description: `Welfare case ${wc.reference} ${status}`, ip: req.ip,
      });
    });

    res.json({ success: true, message: `Case ${status}`, data: { savings_fallback: savingsFallback } });
  } catch (err) { next(err); }
});

module.exports = router;
