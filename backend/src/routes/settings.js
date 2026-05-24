/**
 * backend/src/routes/settings.js — Updated
 * Supports all new settings including member_no_prefix,
 * min_welfare, system configuration
 */

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/db');
const { logAudit } = require('../utils/audit');

/* GET /api/settings */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT key, value, description FROM sacco_settings ORDER BY key');
    const data = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/* PATCH /api/settings */
router.patch('/', authenticate, authorize('admin', 'system_admin'), async (req, res, next) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'settings object required' });
    }

    // Validate prefix
    if (settings.member_no_prefix) {
      const prefix = settings.member_no_prefix.trim().toUpperCase();
      if (!/^[A-Z]{2,8}$/.test(prefix)) {
        return res.status(400).json({
          success: false,
          message: 'member_no_prefix must be 2-8 uppercase letters (e.g. MBR, YISH, MEMBR)',
        });
      }
      settings.member_no_prefix = prefix;
    }

    for (const [key, value] of Object.entries(settings)) {
      await query(
        `INSERT INTO sacco_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, String(value), req.user.id]
      );
    }

    await logAudit(null, {
      actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
      action: 'SETTINGS_UPDATE', entityType: 'settings', entityId: null,
      description: `Settings updated: ${Object.keys(settings).join(', ')}`,
      ip: req.ip, newValues: settings,
    });

    res.json({ success: true, message: 'Settings updated' });
  } catch (err) { next(err); }
});

module.exports = router;
