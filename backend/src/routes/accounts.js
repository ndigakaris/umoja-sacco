/**
 * backend/src/routes/accounts.js — FIXED
 *
 * BUG FIXED: SQL WHERE/AND clause construction was broken.
 * When search was empty, the query became:
 *   "... AND u.role='member'" — invalid, no WHERE clause before AND
 * Fixed by always starting with a WHERE array and joining properly.
 *
 * ADDED: financial year filtering on contribution history endpoint
 * ADDED: GET /summary — SACCO-wide totals by month for the year heatmap
 * ADDED: GET /:userId/monthly — per-member month-by-month breakdown
 */

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit }  = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const { v4: uuidv4 } = require('uuid');

/* ─── GET /api/accounts — member savings summary list ─────────────────── */
router.get('/', authenticate, authorize('admin','treasurer','auditor'), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = '', status = 'active' } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    // FIX: always start with WHERE, build params safely
    const params = ['member', status];
    const where  = ["u.role = $1", "u.status = $2"];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.full_name ILIKE $${params.length} OR u.member_no ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const [{ rows }, { rows: [totals] }, { rows: [{ count }] }] = await Promise.all([
      query(
        `SELECT u.id, u.member_no, u.full_name, u.status, u.created_at,
                COALESCE(a_sav.balance, 0) AS savings_balance,
                COALESCE(a_sha.balance, 0) AS shares_balance,
                COALESCE(a_wel.balance, 0) AS welfare_balance,
                COALESCE(a_sav.balance, 0) + COALESCE(a_sha.balance, 0) AS total_contributions,
                (SELECT COUNT(*) FROM penalties WHERE user_id = u.id AND status = 'pending') AS pending_penalties
         FROM   users u
         LEFT JOIN accounts a_sav ON a_sav.user_id = u.id AND a_sav.type = 'savings'
         LEFT JOIN accounts a_sha ON a_sha.user_id = u.id AND a_sha.type = 'shares'
         LEFT JOIN accounts a_wel ON a_wel.user_id = u.id AND a_wel.type = 'welfare'
         ${whereClause}
         ORDER BY u.full_name ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit, 10), offset]
      ),
      query(
        `SELECT
           COALESCE(SUM(a.balance) FILTER (WHERE a.type = 'savings'), 0) AS total_savings,
           COALESCE(SUM(a.balance) FILTER (WHERE a.type = 'shares'),  0) AS total_shares,
           COALESCE(SUM(a.balance) FILTER (WHERE a.type = 'welfare'), 0) AS total_welfare,
           COUNT(DISTINCT u.id) AS member_count
         FROM accounts a
         JOIN users u ON u.id = a.user_id
         WHERE u.role = 'member' AND u.status = 'active'`
      ),
      query(`SELECT COUNT(*) FROM users u ${whereClause}`, params),
    ]);

    res.json({
      success: true,
      data: rows,
      totals,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: parseInt(count, 10),
        pages: Math.ceil(parseInt(count, 10) / parseInt(limit, 10)),
      },
    });
  } catch (err) { next(err); }
});

/* ─── GET /api/accounts/summary — monthly totals for the financial year ── */
// Returns 12 months of contribution totals for the heatmap/chart
router.get('/summary', authenticate, authorize('admin', 'treasurer', 'auditor'), async (req, res, next) => {
  try {
    // Financial year: April–March (common Kenyan SACCO standard)
    // Or calendar year if fy_type=calendar
    const { year, fy_type = 'calendar' } = req.query;
    const y = parseInt(year, 10) || new Date().getFullYear();

    let startDate, endDate;
    if (fy_type === 'april') {
      startDate = `${y}-04-01`;
      endDate   = `${y + 1}-03-31`;
    } else {
      startDate = `${y}-01-01`;
      endDate   = `${y}-12-31`;
    }

    const { rows } = await query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', t.transaction_date), 'YYYY-MM') AS month,
         t.type AS account_type,
         COUNT(DISTINCT t.user_id)    AS contributor_count,
         SUM(t.credit)                AS total_credited,
         COUNT(*)                     AS transaction_count
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       WHERE u.role = 'member'
         AND t.type IN ('savings', 'shares', 'welfare')
         AND t.transaction_date BETWEEN $1 AND $2
         AND t.credit > 0
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      [startDate, endDate]
    );

    // Also get active member count for compliance %
    const { rows: [{ member_count }] } = await query(
      `SELECT COUNT(*) AS member_count FROM users WHERE role = 'member' AND status = 'active'`
    );

    res.json({ success: true, data: rows, member_count: parseInt(member_count, 10), year: y, fy_type });
  } catch (err) { next(err); }
});

/* ─── GET /api/accounts/settings — SACCO contribution rules ─────────────── */
router.get('/settings', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT key, value, description FROM sacco_settings
       WHERE key IN ('min_savings','min_shares','welfare_contribution','contribution_deadline_day','financial_year_start')`
    );
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

/* ─── GET /api/accounts/:userId — accounts for a member ─────────────────── */
router.get('/:userId', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'member' && req.user.id !== req.params.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { rows } = await query('SELECT * FROM accounts WHERE user_id = $1', [req.params.userId]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/* ─── GET /api/accounts/:userId/monthly — per-member month breakdown ─────── */
router.get('/:userId/monthly', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'member' && req.user.id !== req.params.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { year } = req.query;
    const y = parseInt(year, 10) || new Date().getFullYear();

    const { rows } = await query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', t.transaction_date), 'YYYY-MM') AS month,
         t.type AS account_type,
         SUM(t.credit)  AS total_credited,
         SUM(t.debit)   AS total_debited,
         COUNT(*)        AS tx_count
       FROM transactions t
       WHERE t.user_id = $1
         AND t.type IN ('savings', 'shares', 'welfare')
         AND EXTRACT(YEAR FROM t.transaction_date) = $2
         AND t.credit > 0
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      [req.params.userId, y]
    );

    // Also get pending penalties for this year
    const { rows: pens } = await query(
      `SELECT period_date, type, amount, status, reference
       FROM penalties
       WHERE user_id = $1
         AND EXTRACT(YEAR FROM period_date) = $2
       ORDER BY period_date`,
      [req.params.userId, y]
    );

    res.json({ success: true, data: rows, penalties: pens, year: y });
  } catch (err) { next(err); }
});

/* ─── POST /api/accounts/contribute ─────────────────────────────────────── */
router.post('/contribute', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const {
      user_id, transaction_date, description,
      savings = 0, shares = 0, welfare = 0,
      penalty_payment = 0, penalty_id,
      financial_year, period_month,   // NEW: track which FY/month this belongs to
    } = req.body;

    if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required' });

    const totalAmount = [savings, shares, welfare, penalty_payment]
      .reduce((s, v) => s + (parseFloat(v) || 0), 0);
    if (totalAmount <= 0) {
      return res.status(400).json({ success: false, message: 'At least one contribution amount must be > 0' });
    }

    // Validate member exists and is active
    const { rows: [member] } = await query(
      `SELECT id, full_name, status FROM users WHERE id = $1`, [user_id]
    );
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    if (member.status === 'archived') {
      return res.status(400).json({ success: false, message: 'Cannot record contribution for archived member' });
    }

    const txDate = transaction_date || new Date().toISOString().split('T')[0];
    const recorded = [];
    const baseDesc = description || (period_month ? `Contributions — ${period_month}` : 'Monthly contribution');

    await withTransaction(async (client) => {
      const creditAccount = async (type, amount, desc) => {
        if (!amount || parseFloat(amount) <= 0) return;
        const { rows: [acc] } = await client.query(
          'SELECT * FROM accounts WHERE user_id = $1 AND type = $2 FOR UPDATE', [user_id, type]
        );
        if (!acc) throw Object.assign(new Error(`No ${type} account for this member`), { statusCode: 404 });

        const newBalance = parseFloat(acc.balance) + parseFloat(amount);
        await client.query(
          'UPDATE accounts SET balance = $1, updated_at = NOW() WHERE id = $2',
          [newBalance, acc.id]
        );

        // Generate unique reference
        const ref = `TXN-${txDate.replace(/-/g,'')}-${type.slice(0,3).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
        await client.query(
          `INSERT INTO transactions
             (id, reference, user_id, account_id, type, credit, balance_after, description, recorded_by, transaction_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [uuidv4(), ref, user_id, acc.id, type, parseFloat(amount), newBalance, desc, req.user.id, txDate]
        );
        recorded.push({ type, amount: parseFloat(amount), balance_after: newBalance, reference: ref });
      };

      await creditAccount('savings', savings, `${baseDesc} — Savings`);
      await creditAccount('shares',  shares,  `${baseDesc} — Shares`);
      await creditAccount('welfare', welfare, `${baseDesc} — Welfare`);

      // Penalty payment
      if (parseFloat(penalty_payment) > 0 && penalty_id) {
        const { rows: [pen] } = await client.query(
          'SELECT * FROM penalties WHERE id = $1 AND user_id = $2', [penalty_id, user_id]
        );
        if (pen && pen.status === 'pending') {
          await client.query(
            `UPDATE penalties SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [pen.id]
          );
          const txRef = `TXN-${txDate.replace(/-/g,'')}-PEN-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
          await client.query(
            `INSERT INTO transactions
               (id, reference, user_id, type, credit, description, related_id, recorded_by, transaction_date)
             VALUES ($1,$2,$3,'penalty',$4,$5,$6,$7,$8)`,
            [uuidv4(), txRef, user_id, parseFloat(penalty_payment), `Penalty paid — ${pen.reference}`, pen.id, req.user.id, txDate]
          );
          recorded.push({ type: 'penalty_payment', amount: parseFloat(penalty_payment), penalty_ref: pen.reference });
        }
      }

      await createNotification(client, {
        userId: user_id,
        title: 'Contribution Recorded',
        message: `${baseDesc}: ${recorded.map(r => `KES ${Number(r.amount).toLocaleString()} (${r.type})`).join(', ')}`,
        type: 'system', relatedId: null,
      });

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'CONTRIBUTION_RECORD', entityType: 'account', entityId: null,
        description: `Contribution recorded for ${member.full_name} — KES ${totalAmount} total`,
        ip: req.ip,
        newValues: { savings, shares, welfare, penalty_payment, period_month, financial_year },
      });
    });

    res.json({ success: true, message: 'Contribution recorded successfully', data: recorded });
  } catch (err) { next(err); }
});

/* ─── GET /api/accounts/:userId/contributions ────────────────────────────── */
router.get('/:userId/contributions', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'member' && req.user.id !== req.params.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { from, to, limit = 100, type } = req.query;
    const params = [req.params.userId, parseInt(limit, 10)];
    let filters = '';
    if (from)  { params.push(from); filters += ` AND t.transaction_date >= $${params.length}`; }
    if (to)    { params.push(to);   filters += ` AND t.transaction_date <= $${params.length}`; }
    if (type)  { params.push(type); filters += ` AND t.type = $${params.length}`; }

    const { rows } = await query(
      `SELECT t.*, a.type AS account_type
       FROM   transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE  t.user_id = $1
         AND  t.type IN ('savings', 'shares', 'welfare', 'penalty')
         AND  t.credit > 0
         ${filters}
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT $2`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
