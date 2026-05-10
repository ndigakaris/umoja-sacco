const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { v4: uuidv4 } = require('uuid');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const isAdmin = ['admin','treasurer','auditor'].includes(req.user.role);
    const { rows } = await query(
      `SELECT p.*, u.full_name, u.member_no FROM penalties p JOIN users u ON u.id = p.user_id
       ${isAdmin ? '' : 'WHERE p.user_id = $1'} ORDER BY p.created_at DESC`,
      isAdmin ? [] : [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.get('/rules', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM penalty_rules ORDER BY type');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.put('/rules', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { rules } = req.body;
    for (const r of rules) {
      await query(
        `UPDATE penalty_rules SET rate = $1, is_percent = $2, updated_by = $3, updated_at = NOW() WHERE type = $4`,
        [r.rate, r.is_percent, req.user.id, r.type]
      );
    }
    res.json({ success: true, message: 'Penalty rules updated' });
  } catch (err) { next(err); }
});

router.patch('/:id/waive', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { waive_reason } = req.body;
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE penalties SET status = 'waived', waived_by = $1, waived_at = NOW(), waive_reason = $2, updated_at = NOW() WHERE id = $3`,
        [req.user.id, waive_reason, req.params.id]
      );
      await logAudit(client, { actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role, action: 'PENALTY_WAIVE', entityType: 'penalty', entityId: req.params.id, description: `Penalty waived: ${waive_reason}`, ip: req.ip });
    });
    res.json({ success: true, message: 'Penalty waived' });
  } catch (err) { next(err); }
});

module.exports = router;
