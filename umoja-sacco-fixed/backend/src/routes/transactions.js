const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/db');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { user_id, type, from, to, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const where = [];

    if (req.user.role === 'member') { params.push(req.user.id); where.push(`t.user_id = $${params.length}`); }
    else if (user_id) { params.push(user_id); where.push(`t.user_id = $${params.length}`); }
    if (type) { params.push(type); where.push(`t.type = $${params.length}`); }
    if (from) { params.push(from); where.push(`t.transaction_date >= $${params.length}`); }
    if (to) { params.push(to); where.push(`t.transaction_date <= $${params.length}`); }

    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(
      `SELECT t.*, u.full_name, u.member_no, rb.full_name AS recorded_by_name
       FROM transactions t JOIN users u ON u.id = t.user_id
       LEFT JOIN users rb ON rb.id = t.recorded_by
       ${wc} ORDER BY t.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, parseInt(limit), offset]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
