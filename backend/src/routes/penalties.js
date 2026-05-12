/**
 * backend/src/routes/penalties.js — FIXED
 *
 * BUG FIX: "operator does not exist: transaction_type = account_type"
 *   The auto-generate query compared t.type (transaction_type ENUM) against
 *   a plain string parameter. PostgreSQL refuses implicit ENUM-to-text casts.
 *   Fix: cast t.type to TEXT explicitly: t.type::TEXT = $1
 *
 * NEW: custom_amount field in auto-generate — override the rule rate per run
 * NEW: penalty reference uses MAX() instead of COUNT() — race-safe
 */

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit }  = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const { v4: uuidv4 } = require('uuid');

/* ─── GET /api/penalties ─────────────────────────────────────────────────── */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const isAdmin = ['admin','treasurer','auditor'].includes(req.user.role);
    const { status, type, user_id, page = 1, limit = 100, from, to } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const params = isAdmin ? [] : [req.user.id];
    const where  = isAdmin ? [] : ['p.user_id = $1'];

    // Admin can filter by a specific member
    if (isAdmin && user_id) { params.push(user_id); where.push(`p.user_id = $${params.length}`); }
    if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
    if (type)   { params.push(type);   where.push(`p.type::TEXT = $${params.length}`); }
    if (from)   { params.push(from);   where.push(`p.created_at >= $${params.length}`); }
    if (to)     { params.push(to);     where.push(`p.created_at <= $${params.length}`); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const countParams = [...params];
    params.push(parseInt(limit, 10), offset);

    const [{ rows }, { rows: [summary] }] = await Promise.all([
      query(
        `SELECT p.*, u.full_name, u.member_no, wb.full_name AS waived_by_name
         FROM   penalties p
         JOIN   users u  ON u.id = p.user_id
         LEFT JOIN users wb ON wb.id = p.waived_by
         ${whereClause}
         ORDER  BY p.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      query(
        `SELECT COUNT(*)                                                  AS count,
                COALESCE(SUM(amount), 0)                                  AS total_amount,
                COALESCE(SUM(amount) FILTER (WHERE status='pending'), 0)  AS pending_amount,
                COALESCE(SUM(amount) FILTER (WHERE status='paid'),    0)  AS paid_amount
         FROM penalties p ${whereClause}`,
        countParams
      ),
    ]);

    res.json({ success: true, data: rows, summary });
  } catch (err) { next(err); }
});

/* ─── GET /api/penalties/rules ───────────────────────────────────────────── */
router.get('/rules', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM penalty_rules ORDER BY type');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/* ─── PUT /api/penalties/rules ───────────────────────────────────────────── */
router.put('/rules', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { rules } = req.body;
    for (const r of rules) {
      await query(
        `UPDATE penalty_rules
         SET rate=$1, is_percent=$2, is_active=$3, updated_by=$4, updated_at=NOW()
         WHERE type=$5`,
        [r.rate, r.is_percent, r.is_active !== false, req.user.id, r.type]
      );
    }
    res.json({ success: true, message: 'Penalty rules updated' });
  } catch (err) { next(err); }
});

/* ─── POST /api/penalties — manual penalty ───────────────────────────────── */
router.post('/', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const { user_id, type, amount, description, period_date, loan_id } = req.body;
    if (!user_id || !type || !amount) {
      return res.status(400).json({ success: false, message: 'user_id, type, and amount are required' });
    }

    await withTransaction(async (client) => {
      // Race-safe reference using MAX
      const { rows: [{ max_ref }] } = await client.query(
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(reference, '[^0-9]', '', 'g') AS INT)), 0) AS max_ref
         FROM penalties`
      );
      const ref = `PEN-${String(max_ref + 1).padStart(4, '0')}`;

      const { rows: [pen] } = await client.query(
        `INSERT INTO penalties
           (id, reference, user_id, loan_id, type, amount, description, status, is_auto, period_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',false,$8)
         RETURNING *`,
        [uuidv4(), ref, user_id, loan_id || null, type, amount, description, period_date || null]
      );

      await createNotification(client, {
        userId: user_id,
        title: 'Penalty Issued',
        message: `A penalty of KES ${Number(amount).toLocaleString()} has been issued: ${description || type}`,
        type: 'penalty', relatedId: pen.id,
      });

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'PENALTY_MANUAL_CREATE', entityType: 'penalty', entityId: pen.id,
        description: `Manual penalty ${ref} — KES ${amount}`, ip: req.ip,
      });

      res.status(201).json({ success: true, data: pen });
    });
  } catch (err) { next(err); }
});

/* ─── POST /api/penalties/auto-generate ──────────────────────────────────── */
/*
 * BUG FIX: "operator does not exist: transaction_type = account_type"
 *
 * Root cause: t.type is a PostgreSQL ENUM (transaction_type).
 * Comparing it to a plain text parameter ($1 = 'savings') fails because
 * PostgreSQL won't implicitly cast transaction_type → text for the = operator.
 *
 * Fix: cast the ENUM column to TEXT explicitly:  t.type::TEXT = $1
 *
 * NEW: custom_amount — lets the treasurer override the rule rate for this run
 */
router.post('/auto-generate', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const {
      period_date,
      contribution_type = 'savings',
      deadline_day = 5,
      custom_amount,         // NEW: override the rule amount for this run
    } = req.body;

    const period    = period_date ? new Date(period_date) : new Date();
    const periodStr = `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}-01`;
    const deadlineDate = new Date(period.getFullYear(), period.getMonth(), parseInt(deadline_day, 10));

    if (new Date() < deadlineDate) {
      return res.status(400).json({
        success: false,
        message: `Contribution deadline (${deadlineDate.toDateString()}) has not passed yet. Auto-generate can only run after the deadline.`,
      });
    }

    // Get active penalty rule
    const { rows: [rule] } = await query(
      `SELECT * FROM penalty_rules WHERE type = 'missed_contribution' AND is_active = true`
    );
    if (!rule) {
      return res.status(400).json({ success: false, message: 'No active missed_contribution penalty rule. Configure it in Penalty Rules.' });
    }

    // FIX: use ::TEXT cast to avoid ENUM type mismatch
    // Find members who have NOT contributed for this period
    const { rows: members } = await query(
      `SELECT u.id, u.full_name, u.member_no, COALESCE(a.balance, 0) AS balance
       FROM   users u
       JOIN   accounts a ON a.user_id = u.id AND a.type::TEXT = $1
       WHERE  u.status = 'active' AND u.role = 'member'
         AND  u.id NOT IN (
           SELECT DISTINCT t.user_id
           FROM   transactions t
           WHERE  t.type::TEXT = $1
             AND  DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', $2::date)
             AND  t.credit > 0
         )
         AND  u.id NOT IN (
           SELECT user_id FROM penalties
           WHERE  type = 'missed_contribution'
             AND  DATE_TRUNC('month', period_date) = DATE_TRUNC('month', $2::date)
         )`,
      [contribution_type, periodStr]
    );

    if (members.length === 0) {
      return res.json({
        success: true,
        message: `All members have contributed for ${periodStr}. No penalties generated.`,
        data: [],
      });
    }

    const created = [];

    await withTransaction(async (client) => {
      // Get current MAX ref once, increment per insert
      const { rows: [{ max_ref }] } = await client.query(
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(reference, '[^0-9]', '', 'g') AS INT)), 0) AS max_ref FROM penalties`
      );
      let refCounter = max_ref;

      for (const m of members) {
        refCounter += 1;
        const ref = `PEN-${String(refCounter).padStart(4, '0')}`;

        // Amount: custom_amount > rule rate > percentage of balance
        let amount;
        if (custom_amount && parseFloat(custom_amount) > 0) {
          amount = parseFloat(custom_amount);
        } else if (rule.is_percent) {
          amount = parseFloat(m.balance) * (parseFloat(rule.rate) / 100);
          if (amount <= 0) amount = parseFloat(rule.rate); // floor
        } else {
          amount = parseFloat(rule.rate);
        }
        amount = Math.max(amount, 1); // never zero

        const { rows: [pen] } = await client.query(
          `INSERT INTO penalties
             (id, reference, user_id, type, amount, description, status, is_auto, period_date)
           VALUES ($1,$2,$3,'missed_contribution',$4,$5,'pending',true,$6)
           RETURNING *`,
          [
            uuidv4(), ref, m.id, amount,
            `Auto-penalty: missed ${contribution_type} contribution for ${periodStr}`,
            periodStr,
          ]
        );

        await createNotification(client, {
          userId: m.id,
          title: 'Missed Contribution Penalty',
          message: `A penalty of KES ${Number(amount).toLocaleString()} has been applied for missing your ${contribution_type} contribution for ${new Date(periodStr).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}.`,
          type: 'penalty', relatedId: pen.id,
        });

        created.push({ member_no: m.member_no, full_name: m.full_name, amount, reference: ref });
      }

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'PENALTIES_AUTO_GENERATE', entityType: 'penalty', entityId: null,
        description: `Auto-generated ${created.length} penalties for period ${periodStr} (${contribution_type})`,
        ip: req.ip,
      });
    });

    res.json({
      success: true,
      message: `Generated ${created.length} penalt${created.length === 1 ? 'y' : 'ies'} for ${new Date(periodStr).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}`,
      data: created,
    });
  } catch (err) { next(err); }
});

/* ─── PATCH /:id/waive ───────────────────────────────────────────────────── */
router.patch('/:id/waive', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { waive_reason } = req.body;
    await withTransaction(async (client) => {
      const { rows: [pen] } = await client.query('SELECT * FROM penalties WHERE id = $1', [req.params.id]);
      if (!pen) throw Object.assign(new Error('Penalty not found'), { statusCode: 404 });
      if (pen.status !== 'pending') throw Object.assign(new Error('Only pending penalties can be waived'), { statusCode: 400 });

      await client.query(
        `UPDATE penalties SET status='waived', waived_by=$1, waived_at=NOW(), waive_reason=$2, updated_at=NOW() WHERE id=$3`,
        [req.user.id, waive_reason || 'Waived by admin', req.params.id]
      );
      await createNotification(client, {
        userId: pen.user_id, title: 'Penalty Waived',
        message: `Penalty ${pen.reference} (KES ${Number(pen.amount).toLocaleString()}) has been waived. Reason: ${waive_reason || 'N/A'}`,
        type: 'penalty', relatedId: pen.id,
      });
      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'PENALTY_WAIVE', entityType: 'penalty', entityId: req.params.id,
        description: `Penalty ${pen.reference} waived: ${waive_reason}`, ip: req.ip,
      });
    });
    res.json({ success: true, message: 'Penalty waived successfully' });
  } catch (err) { next(err); }
});

/* ─── PATCH /:id/pay ─────────────────────────────────────────────────────── */
router.patch('/:id/pay', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    await withTransaction(async (client) => {
      const { rows: [pen] } = await client.query('SELECT * FROM penalties WHERE id = $1', [req.params.id]);
      if (!pen) throw Object.assign(new Error('Penalty not found'), { statusCode: 404 });
      if (pen.status !== 'pending') throw Object.assign(new Error('Penalty is not pending'), { statusCode: 400 });

      await client.query(
        `UPDATE penalties SET status='paid', paid_at=NOW(), updated_at=NOW() WHERE id=$1`, [pen.id]
      );

      const { rows: [{ max_ref }] } = await client.query(
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(reference, '[^0-9]', '', 'g') AS INT)), 0) AS max_ref FROM transactions WHERE reference LIKE 'TXN-%'`
      );
      const txRef = `TXN-${Date.now().toString().slice(-8)}`;

      await client.query(
        `INSERT INTO transactions (id, reference, user_id, type, debit, description, related_id, recorded_by, transaction_date)
         VALUES ($1,$2,$3,'penalty',$4,$5,$6,$7,CURRENT_DATE)`,
        [uuidv4(), txRef, pen.user_id, pen.amount, `Penalty paid — ${pen.reference}`, pen.id, req.user.id]
      );

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'PENALTY_PAY', entityType: 'penalty', entityId: pen.id,
        description: `Penalty ${pen.reference} marked as paid`, ip: req.ip,
      });
    });
    res.json({ success: true, message: 'Penalty marked as paid' });
  } catch (err) { next(err); }
});

module.exports = router;
