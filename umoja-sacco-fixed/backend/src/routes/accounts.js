const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { v4: uuidv4 } = require('uuid');

// Get accounts for a user
router.get('/:userId', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM accounts WHERE user_id = $1', [req.params.userId]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Record a contribution
router.post('/contribute', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const { user_id, type, amount, description, transaction_date } = req.body;
    await withTransaction(async (client) => {
      const { rows: [acc] } = await client.query(
        'SELECT * FROM accounts WHERE user_id = $1 AND type = $2', [user_id, type]
      );
      if (!acc) throw Object.assign(new Error('Account not found'), { statusCode: 404 });

      const newBalance = parseFloat(acc.balance) + parseFloat(amount);
      await client.query('UPDATE accounts SET balance = $1, updated_at = NOW() WHERE id = $2', [newBalance, acc.id]);

      const ref = `TXN-${Date.now().toString().slice(-8)}`;
      await client.query(
        `INSERT INTO transactions (id, reference, user_id, account_id, type, credit, balance_after, description, recorded_by, transaction_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [uuidv4(), ref, user_id, acc.id, type, amount, newBalance, description || `${type} contribution`, req.user.id, transaction_date || new Date()]
      );

      await logAudit(client, { actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'CONTRIBUTION_RECORD', entityType: 'account', entityId: acc.id,
        description: `KES ${amount} ${type} contribution recorded`, ip: req.ip });
    });
    res.json({ success: true, message: 'Contribution recorded successfully' });
  } catch (err) { next(err); }
});

module.exports = router;
