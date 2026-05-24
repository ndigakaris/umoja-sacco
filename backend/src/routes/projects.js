/**
 * backend/src/routes/projects.js
 *
 * Project Shares — manage SACCO investment projects and member share allocations.
 * Examples: "Purchase of Land", "Purchase of Tents"
 *
 * Routes:
 *   GET    /api/projects              — list all projects
 *   POST   /api/projects              — create a project (admin/treasurer)
 *   PATCH  /api/projects/:id          — update project details
 *   DELETE /api/projects/:id          — deactivate project
 *   GET    /api/projects/:id/members  — list members + shares for a project
 *   POST   /api/projects/:id/allocate — assign/update share allocation for a member
 *   DELETE /api/projects/:id/allocate/:userId — remove member from project
 *   GET    /api/projects/member/:userId — get all project shares for a member
 */

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { v4: uuidv4 } = require('uuid');

/* ─── GET /api/projects ─────────────────────────────────────────────────── */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { active_only = 'true' } = req.query;
    const whereActive = active_only === 'true' ? 'WHERE p.is_active = true' : '';

    const { rows } = await query(
      `SELECT p.*,
              COUNT(psa.id) AS member_count,
              COALESCE(SUM(psa.amount_paid), 0) AS total_raised,
              COALESCE(SUM(psa.units), 0) AS total_units_allocated
       FROM projects p
       LEFT JOIN project_share_allocations psa ON psa.project_id = p.id
       ${whereActive}
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/* ─── POST /api/projects ─────────────────────────────────────────────────── */
router.post('/', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const { name, description, total_value = 0, share_price = 1 } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Project name is required' });
    }

    const { rows: [project] } = await query(
      `INSERT INTO projects (id, name, description, total_value, share_price, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [uuidv4(), name.trim(), description || null, parseFloat(total_value), parseFloat(share_price), req.user.id]
    );

    await logAudit(null, {
      actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
      action: 'PROJECT_CREATE', entityType: 'project', entityId: project.id,
      description: `Project created: ${name}`, ip: req.ip,
    });

    res.status(201).json({ success: true, message: 'Project created', data: project });
  } catch (err) { next(err); }
});

/* ─── PATCH /api/projects/:id ────────────────────────────────────────────── */
router.patch('/:id', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const { name, description, total_value, share_price, is_active } = req.body;

    const { rows: [project] } = await query(
      `UPDATE projects
       SET name        = COALESCE($1, name),
           description = COALESCE($2, description),
           total_value = COALESCE($3, total_value),
           share_price = COALESCE($4, share_price),
           is_active   = COALESCE($5, is_active),
           updated_at  = NOW()
       WHERE id = $6
       RETURNING *`,
      [name, description, total_value ? parseFloat(total_value) : null,
       share_price ? parseFloat(share_price) : null,
       is_active !== undefined ? is_active : null, req.params.id]
    );

    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    res.json({ success: true, message: 'Project updated', data: project });
  } catch (err) { next(err); }
});

/* ─── GET /api/projects/:id/members ─────────────────────────────────────── */
router.get('/:id/members', authenticate, authorize('admin', 'treasurer', 'auditor'), async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const params = [req.params.id];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      searchClause = `AND (u.full_name ILIKE $${params.length} OR u.member_no ILIKE $${params.length})`;
    }

    const { rows } = await query(
      `SELECT u.id, u.member_no, u.full_name, u.email,
              psa.id AS allocation_id,
              psa.units, psa.amount_paid, psa.notes, psa.alloc_date,
              p.share_price,
              (psa.units * p.share_price) AS total_value
       FROM project_share_allocations psa
       JOIN users u ON u.id = psa.user_id
       JOIN projects p ON p.id = psa.project_id
       WHERE psa.project_id = $1 ${searchClause}
       ORDER BY u.full_name ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit, 10), offset]
    );

    // Also get members NOT in this project for "add member" dropdown
    const { rows: nonMembers } = await query(
      `SELECT u.id, u.member_no, u.full_name
       FROM users u
       WHERE u.role = 'member' AND u.status = 'active'
         AND u.id NOT IN (
           SELECT user_id FROM project_share_allocations WHERE project_id = $1
         )
       ORDER BY u.full_name ASC
       LIMIT 200`,
      [req.params.id]
    );

    res.json({ success: true, data: rows, non_members: nonMembers });
  } catch (err) { next(err); }
});

/* ─── POST /api/projects/:id/allocate ───────────────────────────────────── */
router.post('/:id/allocate', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  try {
    const { user_id, units, amount_paid, notes, alloc_date } = req.body;

    if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required' });
    if (!units || parseFloat(units) < 0) return res.status(400).json({ success: false, message: 'units must be >= 0' });

    const { rows: [alloc] } = await query(
      `INSERT INTO project_share_allocations
         (id, project_id, user_id, units, amount_paid, notes, recorded_by, alloc_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (project_id, user_id) DO UPDATE SET
         units       = $4,
         amount_paid = $5,
         notes       = COALESCE($6, project_share_allocations.notes),
         alloc_date  = COALESCE($8, project_share_allocations.alloc_date),
         updated_at  = NOW()
       RETURNING *`,
      [
        uuidv4(), req.params.id, user_id,
        parseFloat(units), parseFloat(amount_paid || 0),
        notes || null, req.user.id,
        alloc_date || new Date().toISOString().split('T')[0],
      ]
    );

    await logAudit(null, {
      actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
      action: 'PROJECT_ALLOC_UPSERT', entityType: 'project', entityId: req.params.id,
      description: `Allocation set: ${units} units for user ${user_id}`, ip: req.ip,
    });

    res.status(201).json({ success: true, message: 'Allocation saved', data: alloc });
  } catch (err) { next(err); }
});

/* ─── DELETE /api/projects/:id/allocate/:userId ──────────────────────────── */
router.delete('/:id/allocate/:userId', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await query(
      'DELETE FROM project_share_allocations WHERE project_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.json({ success: true, message: 'Allocation removed' });
  } catch (err) { next(err); }
});

/* ─── GET /api/projects/member/:userId — all project shares for one member ── */
router.get('/member/:userId', authenticate, async (req, res, next) => {
  try {
    const targetId = req.params.userId === 'me' ? req.user.id : req.params.userId;

    if (req.user.role === 'member' && req.user.id !== targetId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { rows } = await query(
      `SELECT psa.*, p.name AS project_name, p.description AS project_description,
              p.share_price, p.total_value AS project_total_value, p.is_active,
              (psa.units * p.share_price) AS holding_value
       FROM project_share_allocations psa
       JOIN projects p ON p.id = psa.project_id
       WHERE psa.user_id = $1
       ORDER BY p.name ASC`,
      [targetId]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
