/**
 * Audit Log Utility
 * Use this in every controller that modifies data
 * Audit logs are IMMUTABLE — no updates or deletes
 */

const { query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Write an audit log entry
 * @param {Object|null} client - DB client (use existing transaction client if available, or null)
 * @param {Object} params
 */
async function logAudit(client, { actorId, actorName, actorRole, action, entityType, entityId, description, oldValues, newValues, ip, userAgent }) {
  const sql = `
    INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, description, old_values, new_values, ip_address, user_agent)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  `;
  const params = [
    uuidv4(), actorId, actorName, actorRole, action, entityType || null, entityId || null,
    description, oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null, ip || null, userAgent || null,
  ];

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}

module.exports = { logAudit };
