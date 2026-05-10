const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const { v4: uuidv4 } = require('uuid');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const isAdmin = ['admin','treasurer','auditor'].includes(req.user.role);
    const { rows } = await query(
      `SELECT wc.*, u.full_name, u.member_no FROM welfare_cases wc JOIN users u ON u.id = wc.user_id
       ${isAdmin ? '' : 'WHERE wc.user_id = $1'} ORDER BY wc.created_at DESC`,
      isAdmin ? [] : [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { category, amount, description } = req.body;
    const userId = req.user.role === 'member' ? req.user.id : (req.body.user_id || req.user.id);
    const { rows: [{ count }] } = await query('SELECT COUNT(*) FROM welfare_cases WHERE user_id = $1', [userId]);
    const ref = `WF-${String(parseInt(count) + 1).padStart(3, '0')}`;
    const { rows: [wc] } = await query(
      `INSERT INTO welfare_cases (id, reference, user_id, category, amount, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [uuidv4(), ref, userId, category, amount, description]
    );
    res.status(201).json({ success: true, data: wc });
  } catch (err) { next(err); }
});

router.patch('/:id/review', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const { status, review_note } = req.body;
    await withTransaction(async (client) => {
      const { rows: [wc] } = await client.query('SELECT * FROM welfare_cases WHERE id = $1', [req.params.id]);
      if (!wc) throw Object.assign(new Error('Welfare case not found'), { statusCode: 404 });

      await client.query(
        `UPDATE welfare_cases SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = NOW(),
         disbursed_at = CASE WHEN $1 = 'disbursed' THEN NOW() ELSE NULL END, updated_at = NOW() WHERE id = $4`,
        [status, review_note, req.user.id, req.params.id]
      );

      if (status === 'disbursed') {
        await client.query(
          `UPDATE accounts SET balance = balance - $1, updated_at = NOW()
           WHERE type = 'welfare' AND user_id = (SELECT id FROM users WHERE role != 'member' LIMIT 1)`,
          [wc.amount]
        );
      }

      await createNotification(client, { userId: wc.user_id, title: `Welfare Case ${status}`, message: review_note || `Your welfare case ${wc.reference} has been ${status}.`, type: 'welfare', relatedId: wc.id });
      await logAudit(client, { actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role, action: `WELFARE_${status.toUpperCase()}`, entityType: 'welfare', entityId: wc.id, description: `Welfare ${wc.reference} — ${status}`, ip: req.ip });
    });
    res.json({ success: true, message: `Welfare case ${status}` });
  } catch (err) { next(err); }
});

module.exports = router;
