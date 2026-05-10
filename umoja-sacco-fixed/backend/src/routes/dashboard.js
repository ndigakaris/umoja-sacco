/**
 * Dashboard Route — aggregate stats for admin/treasurer
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/db');

router.get('/', authenticate, authorize('admin', 'treasurer', 'auditor'), async (req, res, next) => {
  try {
    const [members, savings, loans, welfare, pending, overdue] = await Promise.all([
      query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active, COUNT(*) FILTER (WHERE status = 'pending') AS pending FROM users WHERE role = 'member'`),
      query(`SELECT COALESCE(SUM(balance), 0) AS total_savings FROM accounts WHERE type = 'savings'`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(outstanding), 0) AS outstanding FROM loans WHERE status = 'active'`),
      query(`SELECT COALESCE(SUM(balance), 0) AS welfare_fund FROM accounts WHERE type = 'welfare'`),
      query(`SELECT COUNT(*) AS count FROM loans WHERE status IN ('pending', 'under_review')`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(outstanding), 0) AS amount FROM loans WHERE status = 'active' AND due_date < CURRENT_DATE`),
    ]);

    res.json({
      success: true,
      data: {
        members: members.rows[0],
        savings: savings.rows[0],
        loans: loans.rows[0],
        welfare: welfare.rows[0],
        pending_loans: pending.rows[0],
        overdue_loans: overdue.rows[0],
      },
    });
  } catch (err) {
    next(err);
  }
});

// Monthly financial trend (last 7 months)
router.get('/trend', authenticate, authorize('admin', 'treasurer', 'auditor'), async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        TO_CHAR(transaction_date, 'Mon') AS month,
        TO_CHAR(transaction_date, 'YYYY-MM') AS month_key,
        SUM(credit) FILTER (WHERE type = 'savings') AS savings_in,
        SUM(credit) FILTER (WHERE type = 'repayment') AS repayments_in,
        SUM(credit) FILTER (WHERE type = 'loan') AS disbursements_out
      FROM transactions
      WHERE transaction_date >= CURRENT_DATE - INTERVAL '7 months'
      GROUP BY month, month_key
      ORDER BY month_key ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
