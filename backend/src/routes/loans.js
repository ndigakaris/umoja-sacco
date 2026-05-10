const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const ctrl = require('../controllers/loansController');

// Loan Products — configurable, scalable
router.get('/products', authenticate, async (req, res, next) => {
  try {
    const { active_only = 'true' } = req.query;
    const { rows } = await query(
      `SELECT * FROM loan_products ${active_only === 'true' ? "WHERE is_active=true" : ""} ORDER BY name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/products', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const {
      name, description, interest_rate, interest_method = 'reducing',
      min_amount, max_amount, min_term_months, max_term_months,
      max_multiplier = 4.0, guarantors_required = 2, processing_fee_pct = 1.0
    } = req.body;
    const { rows: [product] } = await query(
      `INSERT INTO loan_products (id, name, description, interest_rate, interest_method, min_amount, max_amount, min_term_months, max_term_months, max_multiplier, guarantors_required, processing_fee_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [uuidv4(), name, description, interest_rate, interest_method, min_amount, max_amount, min_term_months, max_term_months, max_multiplier, guarantors_required, processing_fee_pct]
    );
    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.patch('/products/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, description, interest_rate, interest_method, min_amount, max_amount, min_term_months, max_term_months, max_multiplier, guarantors_required, processing_fee_pct, is_active } = req.body;
    const { rows: [product] } = await query(
      `UPDATE loan_products SET
         name=COALESCE($1,name), description=COALESCE($2,description),
         interest_rate=COALESCE($3,interest_rate), interest_method=COALESCE($4,interest_method),
         min_amount=COALESCE($5,min_amount), max_amount=COALESCE($6,max_amount),
         min_term_months=COALESCE($7,min_term_months), max_term_months=COALESCE($8,max_term_months),
         max_multiplier=COALESCE($9,max_multiplier), guarantors_required=COALESCE($10,guarantors_required),
         processing_fee_pct=COALESCE($11,processing_fee_pct), is_active=COALESCE($12,is_active)
       WHERE id=$13 RETURNING *`,
      [name, description, interest_rate, interest_method, min_amount, max_amount, min_term_months, max_term_months, max_multiplier, guarantors_required, processing_fee_pct, is_active, req.params.id]
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

// Loan applications
router.get('/', authenticate, ctrl.listLoans);
router.post('/', authenticate, ctrl.applyLoan);
router.post('/:id/approve', authenticate, authorize('admin', 'treasurer'), ctrl.approveLoan);
router.post('/:id/disburse', authenticate, authorize('admin', 'treasurer'), ctrl.disburseLoan);
router.post('/:id/repay', authenticate, authorize('admin', 'treasurer'), ctrl.recordRepayment);
router.get('/:id/schedule', authenticate, ctrl.getSchedule);
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows: [loan] } = await query(
      `SELECT l.*, u.full_name, u.member_no, lp.name AS product_name,
              json_agg(DISTINCT jsonb_build_object('step',la.step,'action',la.action,'comment',la.comment,'acted_at',la.acted_at,'actor_name',au.full_name)) AS approval_steps
       FROM loans l
       JOIN users u ON u.id=l.user_id
       LEFT JOIN loan_products lp ON lp.id=l.product_id
       LEFT JOIN loan_approvals la ON la.loan_id=l.id
       LEFT JOIN users au ON au.id=la.actor_id
       WHERE l.id=$1
       GROUP BY l.id, u.full_name, u.member_no, lp.name`,
      [req.params.id]
    );
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
    res.json({ success: true, data: loan });
  } catch (err) { next(err); }
});

module.exports = router;
