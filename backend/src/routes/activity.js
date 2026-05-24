/**
 * backend/src/routes/activity.js
 * Activity Log — 45-day rolling window, auto-purge
 *
 * POST /api/activity         — log an activity (frontend call)
 * GET  /api/activity         — list activity (admin/auditor)
 * POST /api/activity/purge   — manual purge (system_admin, also done automatically)
 * POST /api/factory-reset    — factory reset (system_admin ONLY)
 */

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../utils/audit');

const RETENTION_DAYS = 45;

/* POST /api/activity — log a single action from frontend */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { action, entity_type, entity_id, description, metadata } = req.body;
    if (!action) return res.status(400).json({ success: false, message: 'action is required' });

    await query(
      `INSERT INTO activity_log
         (id, user_id, user_name, user_role, action, entity_type, entity_id, description, metadata, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        uuidv4(), req.user.id, req.user.full_name, req.user.role,
        action, entity_type || null, entity_id || null,
        description || null, metadata ? JSON.stringify(metadata) : null,
        req.ip, req.headers['user-agent'] || null,
      ]
    );

    // Auto-purge old records each time a new one is logged (cheap check)
    // This avoids needing a cron job — happens on write
    await query(
      `DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

/* GET /api/activity */
router.get('/', authenticate, authorize('admin', 'auditor'), async (req, res, next) => {
  try {
    const { user_id, action, from, to, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const where  = [];

    if (user_id) { params.push(user_id); where.push(`al.user_id = $${params.length}`); }
    if (action)  { params.push(`%${action}%`); where.push(`al.action ILIKE $${params.length}`); }
    if (from)    { params.push(from); where.push(`al.created_at >= $${params.length}`); }
    if (to)      { params.push(to);   where.push(`al.created_at <= $${params.length}`); }

    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [{ rows }, { rows: [cnt] }] = await Promise.all([
      query(
        `SELECT al.*, u.full_name AS user_display
         FROM activity_log al
         LEFT JOIN users u ON u.id = al.user_id
         ${wc}
         ORDER BY al.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      query(`SELECT COUNT(*) FROM activity_log al ${wc}`, params),
    ]);

    res.json({
      success: true, data: rows,
      pagination: { total: parseInt(cnt.count), page: parseInt(page), limit: parseInt(limit) },
      retention_days: RETENTION_DAYS,
    });
  } catch (err) { next(err); }
});

/* POST /api/activity/purge */
router.post('/purge', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`
    );
    res.json({ success: true, message: `Purged ${rowCount} records older than ${RETENTION_DAYS} days` });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────────────────
 * FACTORY RESET — SYSTEM ADMIN ONLY
 * Supports selective reset by menu/entity type
 * ───────────────────────────────────────────────────────────────────────── */
const RESET_MODULES = {
  loans:        ['repayments', 'loan_approvals', 'loan_guarantors', 'loans'],
  savings:      ['transactions'],  // only savings-type transactions
  welfare:      ['welfare_cases'],
  penalties:    ['penalties'],
  members:      ['member_nok', 'project_share_allocations', 'notifications', 'refresh_tokens', 'profiles', 'accounts', 'users'],
  projects:     ['project_share_allocations', 'projects'],
  imports:      ['bulk_imports'],
  activity:     ['activity_log'],
  audit:        ['audit_logs'],
  all:          null, // handled specially
};

const FACTORY_RESET_ROLE = 'system_admin'; // separate from 'admin'

router.post('/factory-reset', authenticate, async (req, res, next) => {
  // Only system_admin role can do this
  if (req.user.role !== FACTORY_RESET_ROLE) {
    return res.status(403).json({
      success: false,
      message: 'Factory reset is restricted to the System Admin role only. Regular admins cannot perform this action.',
    });
  }

  const { modules = [], confirm_phrase } = req.body;

  if (confirm_phrase !== 'ERASE ALL DATA') {
    return res.status(400).json({
      success: false,
      message: 'You must pass confirm_phrase = "ERASE ALL DATA" to proceed',
    });
  }

  if (!modules || modules.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Specify at least one module to reset, or ["all"] to reset everything',
    });
  }

  const invalid = modules.filter(m => !RESET_MODULES[m]);
  if (invalid.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid modules: ${invalid.join(', ')}. Valid: ${Object.keys(RESET_MODULES).join(', ')}`,
    });
  }

  try {
    let deleted = {};

    await withTransaction(async (client) => {
      if (modules.includes('all')) {
        // Full wipe — preserve system_admin user and groups
        const tables = [
          'activity_log','audit_logs','bulk_imports','notifications','refresh_tokens',
          'repayments','loan_approvals','loan_guarantors','loans',
          'welfare_cases','penalties','project_share_allocations','projects',
          'member_nok','transactions','accounts','profiles',
        ];
        for (const t of tables) {
          const r = await client.query(`DELETE FROM ${t}`);
          deleted[t] = r.rowCount;
        }
        // Delete all members except the system_admin user making the request
        const r2 = await client.query(`DELETE FROM users WHERE id != $1`, [req.user.id]);
        deleted['users'] = r2.rowCount;
      } else {
        for (const mod of modules) {
          const tables = RESET_MODULES[mod];
          if (!tables) continue;
          for (const t of tables) {
            if (t === 'users') {
              const r = await client.query(`DELETE FROM users WHERE role != 'system_admin'`);
              deleted[t] = (deleted[t] || 0) + r.rowCount;
            } else if (t === 'transactions' && mod === 'savings') {
              const r = await client.query(
                `DELETE FROM transactions WHERE type IN ('savings','shares','welfare')`
              );
              deleted[t] = (deleted[t] || 0) + r.rowCount;
            } else {
              const r = await client.query(`DELETE FROM ${t}`);
              deleted[t] = (deleted[t] || 0) + r.rowCount;
            }
          }
        }
      }

      await client.query(
        `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, description, created_at)
         VALUES ($1,$2,$3,$4,'FACTORY_RESET',$5,NOW())`,
        [uuidv4(), req.user.id, req.user.full_name, req.user.role,
         `Factory reset performed. Modules: ${modules.join(', ')}. Tables: ${JSON.stringify(deleted)}`]
      );
    });

    res.json({
      success: true,
      message: `Factory reset complete. Modules reset: ${modules.join(', ')}`,
      deleted,
    });
  } catch (err) { next(err); }
});

module.exports = router;
