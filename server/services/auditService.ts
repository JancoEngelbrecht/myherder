// @ts-nocheck
import { randomUUID as uuidv4 } from 'crypto'
import db from '../config/database'

interface LogAuditOptions {
  farmId: string
  userId: string
  action: 'create' | 'update' | 'delete'
  entityType: string
  entityId: string
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
}

/**
 * Log an audit entry.
 */
async function logAudit({
  farmId,
  userId,
  action,
  entityType,
  entityId,
  oldValues = null,
  newValues = null,
}: LogAuditOptions): Promise<void> {
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
  } catch (err: any) {
    // Audit logging should never break the main operation — best-effort only
    console.error('[audit] Failed to write audit log:', err.message)
  }
}

module.exports = { logAudit }
