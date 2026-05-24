/**
 * backend/src/routes/groups.js
 * User Groups & Permissions — Shopify-style role management
 *
 * GET    /api/groups              — list all groups with member count
 * POST   /api/groups              — create group
 * PATCH  /api/groups/:id          — update name/description/permissions
 * DELETE /api/groups/:id          — delete (non-system) group
 * GET    /api/groups/:id/members  — list users in group
 * POST   /api/groups/:id/members  — add user to group
 * DELETE /api/groups/:id/members/:userId — remove user from group
 * GET    /api/groups/user/:userId — get all groups a user belongs to
 */

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { v4: uuidv4 } = require('uuid');

/* GET /api/groups */
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT g.*,
              COUNT(ugm.user_id) AS member_count
       FROM user_groups g
       LEFT JOIN user_group_members ugm ON ugm.group_id = g.id
       GROUP BY g.id
       ORDER BY g.is_system DESC, g.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/* POST /api/groups */
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, description, permissions = {} } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Group name is required' });

    const { rows: [g] } = await query(
      `INSERT INTO user_groups (id, name, description, permissions, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [uuidv4(), name.trim(), description || null, JSON.stringify(permissions), req.user.id]
    );

    await logAudit(null, { actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
      action: 'GROUP_CREATE', entityType: 'group', entityId: g.id,
      description: `Group created: ${name}`, ip: req.ip });

    res.status(201).json({ success: true, data: g });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Group name already exists' });
    next(err);
  }
});

/* PATCH /api/groups/:id */
router.patch('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;
    const { rows: [existing] } = await query('SELECT * FROM user_groups WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Group not found' });

    const newPerms = permissions !== undefined ? JSON.stringify(permissions) : JSON.stringify(existing.permissions);

    const { rows: [g] } = await query(
      `UPDATE user_groups
       SET name        = COALESCE($1, name),
           description = COALESCE($2, description),
           permissions = $3::jsonb,
           updated_at  = NOW()
       WHERE id = $4 RETURNING *`,
      [name || null, description || null, newPerms, req.params.id]
    );

    res.json({ success: true, data: g });
  } catch (err) { next(err); }
});

/* DELETE /api/groups/:id */
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { rows: [g] } = await query('SELECT * FROM user_groups WHERE id = $1', [req.params.id]);
    if (!g) return res.status(404).json({ success: false, message: 'Group not found' });
    if (g.is_system) return res.status(403).json({ success: false, message: 'System groups cannot be deleted' });

    await query('DELETE FROM user_groups WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Group deleted' });
  } catch (err) { next(err); }
});

/* GET /api/groups/:id/members */
router.get('/:id/members', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.member_no, u.full_name, u.email, u.role, u.status,
              ugm.assigned_at, ab.full_name AS assigned_by_name
       FROM user_group_members ugm
       JOIN users u ON u.id = ugm.user_id
       LEFT JOIN users ab ON ab.id = ugm.assigned_by
       WHERE ugm.group_id = $1
       ORDER BY u.full_name ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/* POST /api/groups/:id/members */
router.post('/:id/members', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: 'user_id required' });

    await query(
      `INSERT INTO user_group_members (user_id, group_id, assigned_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [user_id, req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'User added to group' });
  } catch (err) { next(err); }
});

/* DELETE /api/groups/:id/members/:userId */
router.delete('/:id/members/:userId', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await query(
      'DELETE FROM user_group_members WHERE group_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.json({ success: true, message: 'User removed from group' });
  } catch (err) { next(err); }
});

/* GET /api/groups/user/:userId */
router.get('/user/:userId', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT g.id, g.name, g.description, g.permissions, ugm.assigned_at
       FROM user_group_members ugm
       JOIN user_groups g ON g.id = ugm.group_id
       WHERE ugm.user_id = $1`,
      [req.params.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
