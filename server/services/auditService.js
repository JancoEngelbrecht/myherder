const { randomUUID: uuidv4 } = require('crypto')
const db = require('../config/database')

/**
 * Log an audit entry.
 * @param {object} opts
 * @param {string} opts.farmId - ID of the farm (tenant)
 * @param {string} opts.userId - ID of the user performing the action
 * @param {string} opts.action - 'create' | 'update' | 'delete'
 * @param {string} opts.entityType - e.g. 'user', 'cow', 'setting'
 * @param {string} opts.entityId - ID of the affected entity
 * @param {object|null} [opts.oldValues] - previous state (for update/delete)
 * @param {object|null} [opts.newValues] - new state (for create/update)
 */
async function logAudit({
  farmId,
  userId,
  action,
  entityType,
  entityId,
  oldValues = null,
  newValues = null,
}) {
  try {
    await db('audit_log').insert({
      id: uuidv4(),
      farm_id: farmId,
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues ? JSON.stringify(oldValues) : null,
      new_values: newValues ? JSON.stringify(newValues) : null,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    // Audit logging should never break the main operation — best-effort only
    console.error('[audit] Failed to write audit log:', err.message)
  }
}

module.exports = { logAudit }
