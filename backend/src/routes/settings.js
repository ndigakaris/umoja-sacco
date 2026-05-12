/**
 * ADD to backend/src/routes/ as settings.js
 * Then register in server.js: app.use('/api/settings', require('./src/routes/settings'));
 *
 * Allows admin to read/update sacco_settings from the UI
 */

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/db');
const { logAudit } = require('../utils/audit');

// GET /api/settings
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT key, value, description FROM sacco_settings ORDER BY key');
    const data = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// PATCH /api/settings — update one or more settings
router.patch('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { settings } = req.body;
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
      description: `SACCO settings updated: ${Object.keys(settings).join(', ')}`,
      ip: req.ip, newValues: settings,
    });
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) { next(err); }
});

module.exports = router;
