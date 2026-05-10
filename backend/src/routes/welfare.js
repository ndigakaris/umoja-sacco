const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const { v4: uuidv4 } = require('uuid');

// GET all welfare cases
router.get('/', authenticate, async (req, res, next) => {
  try {
    const isAdmin = ['admin','treasurer','auditor'].includes(req.user.role);
    const { status } = req.query;
    const params = isAdmin ? [] : [req.user.id];
    let where = isAdmin ? [] : ['wc.user_id = $1'];
    if (status) { params.push(status); where.push(`wc.status = $${params.length}`); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [{ rows }, { rows: [summary] }] = await Promise.all([
      query(
        `SELECT wc.*, u.full_name, u.member_no,
                rv.full_name AS reviewed_by_name
         FROM welfare_cases wc
         JOIN users u ON u.id = wc.user_id
         LEFT JOIN users rv ON rv.id = wc.reviewed_by
         ${whereClause} ORDER BY wc.created_at DESC`,
        params
      ),
      query(
        `SELECT COUNT(*) AS total_cases,
                SUM(amount) AS total_amount,
                SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN status='disbursed' THEN amount ELSE 0 END) AS disbursed_amount
         FROM welfare_cases wc ${whereClause}`,
        params
      ),
    ]);
    res.json({ success: true, data: rows, summary });
  } catch (err) { next(err); }
});

// POST file a welfare case
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { category, amount, description } = req.body;
    const userId = req.user.role === 'member' ? req.user.id : (req.body.user_id || req.user.id);
    const { rows: [{ count }] } = await query('SELECT COUNT(*) FROM welfare_cases');
    const ref = `WF-${String(parseInt(count) + 1).padStart(3, '0')}`;
    const { rows: [wc] } = await query(
      `INSERT INTO welfare_cases (id, reference, user_id, category, amount, description)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [uuidv4(), ref, userId, category, amount, description]
    );
    res.status(201).json({ success: true, data: wc });
  } catch (err) { next(err); }
});

// PATCH /:id/review — approve, reject, or disburse
// FIX: Welfare funds deducted from welfare pool account (sacco-level)
// IMPROVEMENT: If welfare funds insufficient, fallback to member savings
router.patch('/:id/review', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const { status, review_note } = req.body;
    const validStatuses = ['approved', 'rejected', 'disbursed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    await withTransaction(async (client) => {
      const { rows: [wc] } = await client.query('SELECT * FROM welfare_cases WHERE id = $1', [req.params.id]);
      if (!wc) throw Object.assign(new Error('Welfare case not found'), { statusCode: 404 });

      // Prevent duplicate approval/rejection
      if (['approved','rejected','disbursed'].includes(wc.status)) {
        throw Object.assign(new Error(`Case is already ${wc.status}`), { statusCode: 400 });
      }

      let disbursedFrom = null;
      let savingsFallback = false;

      if (status === 'disbursed') {
        // 1. Check SACCO-level welfare pool (aggregated welfare accounts for non-member admin users)
        const { rows: [welfareFund] } = await client.query(
          `SELECT COALESCE(SUM(a.balance),0) AS total
           FROM accounts a JOIN users u ON u.id = a.user_id
           WHERE a.type='welfare' AND u.role != 'member'`
        );
        const poolBalance = parseFloat(welfareFund.total);

        if (poolBalance >= wc.amount) {
          // Deduct from SACCO welfare pool (deduct from the first admin welfare account)
          await client.query(
            `UPDATE accounts SET balance = balance - $1, updated_at=NOW()
             WHERE type='welfare' AND user_id=(SELECT id FROM users WHERE role='admin' LIMIT 1)`,
            [wc.amount]
          );
          disbursedFrom = 'welfare_pool';
        } else {
          // Fallback: deduct from member's savings account
          const { rows: [savAcc] } = await client.query(
            `SELECT * FROM accounts WHERE user_id=$1 AND type='savings'`, [wc.user_id]
          );
          if (!savAcc || savAcc.balance < wc.amount) {
            throw Object.assign(
              new Error(`Insufficient welfare pool funds (KES ${poolBalance.toLocaleString()}) and insufficient member savings (KES ${(savAcc?.balance || 0).toLocaleString()}). Cannot disburse KES ${Number(wc.amount).toLocaleString()}.`),
              { statusCode: 400 }
            );
          }
          await client.query(
            `UPDATE accounts SET balance=balance-$1, updated_at=NOW() WHERE id=$2`,
            [wc.amount, savAcc.id]
          );
          disbursedFrom = 'member_savings';
          savingsFallback = true;

          // Log the savings deduction transaction
          const txRef2 = `TXN-${Date.now().toString().slice(-8)}-WF`;
          await client.query(
            `INSERT INTO transactions (id, reference, user_id, account_id, type, debit, balance_after, description, related_id, recorded_by, transaction_date)
             VALUES ($1,$2,$3,$4,'welfare',$5,$6,$7,$8,$9,CURRENT_DATE)`,
            [uuidv4(), txRef2, wc.user_id, savAcc.id, wc.amount,
             parseFloat(savAcc.balance) - parseFloat(wc.amount),
             `Welfare disbursement ${wc.reference} — deducted from savings (pool insufficient)`,
             wc.id, req.user.id]
          );
        }

        // Record expenditure for finance tracking
        const expRef = `EXP-${Date.now().toString().slice(-8)}`;
        await client.query(
          `INSERT INTO expenditures (id, reference, category, description, amount, recorded_by, approved_by, expense_date)
           VALUES ($1,$2,'Welfare Disbursement',$3,$4,$5,$6,CURRENT_DATE)`,
          [uuidv4(), expRef, `Welfare case ${wc.reference} — ${wc.category} (from ${disbursedFrom})`, wc.amount, req.user.id, req.user.id]
        );
      }

      await client.query(
        `UPDATE welfare_cases SET status=$1, review_note=$2, reviewed_by=$3, reviewed_at=NOW(),
         disbursed_at=CASE WHEN $1='disbursed' THEN NOW() ELSE NULL END, updated_at=NOW() WHERE id=$4`,
        [status, review_note, req.user.id, req.params.id]
      );

      const notifMsg = savingsFallback
        ? `Your welfare case ${wc.reference} has been disbursed. Note: welfare pool was insufficient — funds deducted from your savings account.`
        : review_note || `Your welfare case ${wc.reference} has been ${status}.`;

      await createNotification(client, {
        userId: wc.user_id, title: `Welfare Case ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: notifMsg, type: 'welfare', relatedId: wc.id,
      });

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: `WELFARE_${status.toUpperCase()}`, entityType: 'welfare', entityId: wc.id,
        description: `Welfare ${wc.reference} — ${status}${disbursedFrom ? ` from ${disbursedFrom}` : ''}`, ip: req.ip,
      });

      res.json({
        success: true,
        message: `Welfare case ${status}`,
        data: { disbursed_from: disbursedFrom, savings_fallback: savingsFallback },
      });
    });
  } catch (err) { next(err); }
});

// GET welfare pool balance (admin/treasurer)
router.get('/pool-balance', authenticate, authorize('admin', 'treasurer', 'auditor'), async (req, res, next) => {
  try {
    const { rows: [result] } = await query(
      `SELECT COALESCE(SUM(a.balance),0) AS pool_balance
       FROM accounts a JOIN users u ON u.id=a.user_id
       WHERE a.type='welfare' AND u.role != 'member'`
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
