const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const { v4: uuidv4 } = require('uuid');

// GET all savings/shares summary (admin view)
router.get('/', authenticate, authorize('admin','treasurer','auditor'), async (req, res, next) => {
  try {
    const { page = 1, limit = 30, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = search ? [`%${search}%`] : [];
    const searchClause = search ? `WHERE u.full_name ILIKE $1 OR u.member_no ILIKE $1` : '';

    const { rows } = await query(
      `SELECT u.id, u.member_no, u.full_name,
              COALESCE(a_sav.balance,0) AS savings_balance,
              COALESCE(a_sha.balance,0) AS shares_balance,
              COALESCE(a_wel.balance,0) AS welfare_balance,
              COALESCE(a_sav.balance,0) + COALESCE(a_sha.balance,0) AS total_contributions
       FROM users u
       LEFT JOIN accounts a_sav ON a_sav.user_id=u.id AND a_sav.type='savings'
       LEFT JOIN accounts a_sha ON a_sha.user_id=u.id AND a_sha.type='shares'
       LEFT JOIN accounts a_wel ON a_wel.user_id=u.id AND a_wel.type='welfare'
       ${searchClause}
       AND u.role='member' AND u.status='active'
       ORDER BY u.full_name ASC
       LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, parseInt(limit), offset]
    );

    const { rows: [totals] } = await query(
      `SELECT COALESCE(SUM(a.balance),0) FILTER (WHERE a.type='savings') AS total_savings,
              COALESCE(SUM(a.balance),0) FILTER (WHERE a.type='shares') AS total_shares,
              COALESCE(SUM(a.balance),0) FILTER (WHERE a.type='welfare') AS total_welfare
       FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.role='member'`
    );

    res.json({ success: true, data: rows, totals });
  } catch (err) { next(err); }
});

// GET accounts for a specific user
router.get('/:userId', authenticate, async (req, res, next) => {
  try {
    // Members can only see their own accounts
    if (req.user.role === 'member' && req.user.id !== req.params.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { rows } = await query('SELECT * FROM accounts WHERE user_id = $1', [req.params.userId]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST record contribution — now supports shares, welfare, penalties, and extensible future types
router.post('/contribute', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const {
      user_id,
      transaction_date,
      description,
      // Scalable contribution fields:
      savings = 0,
      shares = 0,
      welfare = 0,
      penalty_payment = 0,  // optional: pay a pending penalty via contribution
      custom_fields = [],   // [{label, account_type, amount}] for future extensibility
    } = req.body;

    if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required' });

    const totalAmount = parseFloat(savings) + parseFloat(shares) + parseFloat(welfare) + parseFloat(penalty_payment);
    if (totalAmount <= 0) return res.status(400).json({ success: false, message: 'At least one contribution amount must be > 0' });

    const txDate = transaction_date || new Date();
    const recorded = [];

    await withTransaction(async (client) => {
      // Helper: credit an account type
      const creditAccount = async (type, amount, desc) => {
        if (!amount || parseFloat(amount) <= 0) return;
        const { rows: [acc] } = await client.query(
          'SELECT * FROM accounts WHERE user_id=$1 AND type=$2', [user_id, type]
        );
        if (!acc) throw Object.assign(new Error(`No ${type} account for this member`), { statusCode: 404 });

        const newBalance = parseFloat(acc.balance) + parseFloat(amount);
        await client.query('UPDATE accounts SET balance=$1, updated_at=NOW() WHERE id=$2', [newBalance, acc.id]);

        const ref = `TXN-${Date.now().toString().slice(-6)}-${type.slice(0,3).toUpperCase()}`;
        await client.query(
          `INSERT INTO transactions (id, reference, user_id, account_id, type, credit, balance_after, description, recorded_by, transaction_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [uuidv4(), ref, user_id, acc.id, type, amount, newBalance, desc || `${type} contribution`, req.user.id, txDate]
        );
        recorded.push({ type, amount, balance_after: newBalance, reference: ref });
      };

      await creditAccount('savings', savings, description || 'Savings contribution');
      await creditAccount('shares', shares, description || 'Shares contribution');
      await creditAccount('welfare', welfare, description || 'Welfare contribution');

      // Handle penalty payment via contribution
      if (parseFloat(penalty_payment) > 0 && req.body.penalty_id) {
        const { rows: [pen] } = await client.query('SELECT * FROM penalties WHERE id=$1', [req.body.penalty_id]);
        if (pen && pen.status === 'pending') {
          await client.query(`UPDATE penalties SET status='paid', paid_at=NOW() WHERE id=$1`, [pen.id]);
          const txRef = `TXN-${Date.now().toString().slice(-6)}-PEN`;
          await client.query(
            `INSERT INTO transactions (id, reference, user_id, type, credit, description, related_id, recorded_by, transaction_date)
             VALUES ($1,$2,$3,'penalty',$4,$5,$6,$7,$8)`,
            [uuidv4(), txRef, user_id, penalty_payment, `Penalty payment — ${pen.reference}`, pen.id, req.user.id, txDate]
          );
          recorded.push({ type: 'penalty_payment', amount: penalty_payment, penalty_ref: pen.reference });
        }
      }

      // Handle custom extensible fields
      for (const cf of custom_fields) {
        if (cf.amount && cf.account_type) {
          await creditAccount(cf.account_type, cf.amount, cf.label || `${cf.account_type} contribution`);
        }
      }

      await createNotification(client, {
        userId: user_id,
        title: 'Contribution Recorded',
        message: `Contributions recorded: ${recorded.map(r => `KES ${Number(r.amount).toLocaleString()} (${r.type})`).join(', ')}`,
        type: 'system', relatedId: null,
      });

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'CONTRIBUTION_RECORD', entityType: 'account', entityId: null,
        description: `Multi-type contribution recorded for user ${user_id}: total KES ${totalAmount}`,
        ip: req.ip, newValues: { savings, shares, welfare, penalty_payment },
      });
    });

    res.json({ success: true, message: 'Contribution recorded successfully', data: recorded });
  } catch (err) { next(err); }
});

// GET contribution history for a member
router.get('/:userId/contributions', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'member' && req.user.id !== req.params.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { from, to, limit = 50 } = req.query;
    const params = [req.params.userId, parseInt(limit)];
    let dateFilter = '';
    if (from) { params.push(from); dateFilter += ` AND t.transaction_date >= $${params.length}`; }
    if (to)   { params.push(to);   dateFilter += ` AND t.transaction_date <= $${params.length}`; }

    const { rows } = await query(
      `SELECT t.*, a.type AS account_type FROM transactions t
       LEFT JOIN accounts a ON a.id=t.account_id
       WHERE t.user_id=$1 AND t.type IN ('savings','shares','welfare','penalty')
       ${dateFilter}
       ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT $2`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
