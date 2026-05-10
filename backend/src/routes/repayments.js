const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/db');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { loan_id } = req.query;
    const { rows } = await query(
      `SELECT r.*, rb.full_name AS recorded_by_name FROM repayments r
       LEFT JOIN users rb ON rb.id = r.recorded_by
       WHERE r.loan_id = $1 ORDER BY r.payment_date DESC`,
      [loan_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
