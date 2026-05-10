const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/db');

// Income & Expenditure summary
router.get('/income-expenditure', authenticate, authorize('admin', 'treasurer', 'auditor'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const params = [from || new Date(new Date().getFullYear(), 0, 1), to || new Date()];
    const { rows: income } = await query(
      `SELECT type, SUM(credit) AS total FROM transactions WHERE transaction_date BETWEEN $1 AND $2 AND credit > 0 GROUP BY type ORDER BY type`,
      params
    );
    const { rows: expenses } = await query(
      `SELECT category, SUM(amount) AS total FROM expenditures WHERE expense_date BETWEEN $1 AND $2 GROUP BY category`,
      params
    );
    res.json({ success: true, data: { income, expenses } });
  } catch (err) { next(err); }
});

// Loan book summary
router.get('/loan-book', authenticate, authorize('admin', 'treasurer', 'auditor'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT l.*, u.full_name, u.member_no, lp.name AS product_name FROM loans l
       JOIN users u ON u.id = l.user_id LEFT JOIN loan_products lp ON lp.id = l.product_id
       WHERE l.status != 'draft' ORDER BY l.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
