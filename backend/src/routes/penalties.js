const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const { v4: uuidv4 } = require('uuid');

// GET all penalties
router.get('/', authenticate, async (req, res, next) => {
  try {
    const isAdmin = ['admin','treasurer','auditor'].includes(req.user.role);
    const { status, type, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = isAdmin ? [] : [req.user.id];
    let where = isAdmin ? [] : ['p.user_id = $1'];
    if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
    if (type)   { params.push(type);   where.push(`p.type = $${params.length}`); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    params.push(parseInt(limit), offset);

    const [{ rows }, { rows: tot }] = await Promise.all([
      query(
        `SELECT p.*, u.full_name, u.member_no,
                wb.full_name AS waived_by_name
         FROM penalties p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN users wb ON wb.id = p.waived_by
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      query(
        `SELECT COUNT(*), SUM(amount) AS total_amount,
                SUM(CASE WHEN status='pending' THEN amount ELSE 0 END) AS pending_amount
         FROM penalties p ${whereClause}`,
        params.slice(0, -2)
      ),
    ]);
    res.json({ success: true, data: rows, summary: tot[0] });
  } catch (err) { next(err); }
});

// GET penalty rules
router.get('/rules', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM penalty_rules ORDER BY type');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// PUT update penalty rules
router.put('/rules', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { rules } = req.body;
    for (const r of rules) {
      await query(
        `UPDATE penalty_rules SET rate=$1, is_percent=$2, updated_by=$3, updated_at=NOW() WHERE type=$4`,
        [r.rate, r.is_percent, req.user.id, r.type]
      );
    }
    res.json({ success: true, message: 'Penalty rules updated' });
  } catch (err) { next(err); }
});

// POST manual penalty — admin/treasurer adds penalty for any member
router.post('/', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const { user_id, type, amount, description, period_date, loan_id } = req.body;
    if (!user_id || !type || !amount) {
      return res.status(400).json({ success: false, message: 'user_id, type, and amount are required' });
    }
    await withTransaction(async (client) => {
      const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM penalties');
      const ref = `PEN-${String(parseInt(count) + 1).padStart(4, '0')}`;

      const { rows: [pen] } = await client.query(
        `INSERT INTO penalties (id, reference, user_id, loan_id, type, amount, description, status, is_auto, period_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',false,$8) RETURNING *`,
        [uuidv4(), ref, user_id, loan_id || null, type, amount, description, period_date || null]
      );

      await createNotification(client, {
        userId: user_id,
        title: 'Penalty Issued',
        message: `A penalty of KES ${Number(amount).toLocaleString()} has been recorded: ${description || type}`,
        type: 'penalty', relatedId: pen.id,
      });

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'PENALTY_MANUAL_CREATE', entityType: 'penalty', entityId: pen.id,
        description: `Manual penalty ${ref} — KES ${amount} for user ${user_id}`, ip: req.ip,
      });

      res.status(201).json({ success: true, data: pen });
    });
  } catch (err) { next(err); }
});

// POST auto-generate missed contribution penalties for the current month
// Called by admin/treasurer or a cron job endpoint
router.post('/auto-generate', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const { period_date, contribution_type = 'savings', deadline_day = 5 } = req.body;
    const period = period_date ? new Date(period_date) : new Date();
    const periodStr = `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}-01`;
    const deadlineDate = new Date(period.getFullYear(), period.getMonth(), deadline_day);

    if (new Date() < deadlineDate) {
      return res.status(400).json({ success: false, message: `Deadline of ${deadlineDate.toDateString()} has not passed yet` });
    }

    // Get penalty rule for missed_contribution
    const { rows: [rule] } = await query(
      `SELECT * FROM penalty_rules WHERE type='missed_contribution' AND is_active=true`
    );
    if (!rule) return res.status(400).json({ success: false, message: 'No active missed_contribution penalty rule configured' });

    // Find active members who have NOT contributed for this period
    const { rows: members } = await query(
      `SELECT u.id, u.full_name, u.member_no, a.balance
       FROM users u
       JOIN accounts a ON a.user_id = u.id AND a.type = $1
       WHERE u.status = 'active' AND u.role = 'member'
       AND u.id NOT IN (
         SELECT DISTINCT t.user_id FROM transactions t
         WHERE t.type = $1
           AND DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', $2::date)
       )
       AND u.id NOT IN (
         SELECT user_id FROM penalties
         WHERE type = 'missed_contribution' AND period_date = $2::date
       )`,
      [contribution_type, periodStr]
    );

    const created = [];
    await withTransaction(async (client) => {
      for (const m of members) {
        const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM penalties');
        const ref = `PEN-${String(parseInt(count) + 1 + created.length).padStart(4, '0')}`;
        const amount = rule.is_percent ? m.balance * (rule.rate / 100) : rule.rate;

        const { rows: [pen] } = await client.query(
          `INSERT INTO penalties (id, reference, user_id, type, amount, description, status, is_auto, period_date)
           VALUES ($1,$2,$3,'missed_contribution',$4,$5,'pending',true,$6) RETURNING *`,
          [uuidv4(), ref, m.id, amount, `Auto-penalty: missed ${contribution_type} contribution for ${periodStr}`, periodStr]
        );

        await createNotification(client, {
          userId: m.id,
          title: 'Missed Contribution Penalty',
          message: `A penalty of KES ${Number(amount).toLocaleString()} has been applied for missing your ${contribution_type} contribution for ${periodStr}.`,
          type: 'penalty', relatedId: pen.id,
        });

        created.push({ member_no: m.member_no, full_name: m.full_name, amount, reference: ref });
      }

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'PENALTIES_AUTO_GENERATE', entityType: 'penalty', entityId: null,
        description: `Auto-generated ${created.length} penalties for period ${periodStr}`, ip: req.ip,
      });
    });

    res.json({ success: true, message: `Generated ${created.length} penalties`, data: created });
  } catch (err) { next(err); }
});

// PATCH /:id/waive
router.patch('/:id/waive', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { waive_reason } = req.body;
    await withTransaction(async (client) => {
      const { rows: [pen] } = await client.query('SELECT * FROM penalties WHERE id=$1', [req.params.id]);
      if (!pen) throw Object.assign(new Error('Penalty not found'), { statusCode: 404 });

      await client.query(
        `UPDATE penalties SET status='waived', waived_by=$1, waived_at=NOW(), waive_reason=$2, updated_at=NOW() WHERE id=$3`,
        [req.user.id, waive_reason, req.params.id]
      );
      await createNotification(client, {
        userId: pen.user_id, title: 'Penalty Waived',
        message: `Penalty ${pen.reference} has been waived. Reason: ${waive_reason || 'N/A'}`,
        type: 'penalty', relatedId: pen.id,
      });
      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'PENALTY_WAIVE', entityType: 'penalty', entityId: req.params.id,
        description: `Penalty waived: ${waive_reason}`, ip: req.ip,
      });
    });
    res.json({ success: true, message: 'Penalty waived' });
  } catch (err) { next(err); }
});

// PATCH /:id/pay — mark penalty as paid (deducts from savings if needed)
router.patch('/:id/pay', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    await withTransaction(async (client) => {
      const { rows: [pen] } = await client.query('SELECT * FROM penalties WHERE id=$1', [req.params.id]);
      if (!pen) throw Object.assign(new Error('Penalty not found'), { statusCode: 404 });
      if (pen.status !== 'pending') throw Object.assign(new Error('Penalty is not pending'), { statusCode: 400 });

      await client.query(
        `UPDATE penalties SET status='paid', paid_at=NOW(), updated_at=NOW() WHERE id=$1`, [pen.id]
      );

      // Record transaction
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
