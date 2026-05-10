const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/db');

router.get('/', authenticate, authorize('admin', 'auditor'), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, action, actor_id, from, to } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const where = [];

    if (action) { params.push(`%${action}%`); where.push(`al.action ILIKE $${params.length}`); }
    if (actor_id) { params.push(actor_id); where.push(`al.actor_id = $${params.length}`); }
    if (from) { params.push(from); where.push(`al.created_at >= $${params.length}`); }
    if (to) { params.push(to); where.push(`al.created_at <= $${params.length}`); }

    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(
      `SELECT al.* FROM audit_logs al ${wc} ORDER BY al.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, parseInt(limit), offset]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
