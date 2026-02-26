const db = require('../config/database')
const { randomUUID: uuidv4 } = require('crypto')

// ── Entity-to-Table Mapping ─────────────────────────────────────

const ENTITY_MAP = {
  cows: { table: 'cows', softDelete: true },
  medications: { table: 'medications', softDelete: false },
  treatments: { table: 'treatments', softDelete: false },
  healthIssues: { table: 'health_issues', softDelete: false },
  milkRecords: { table: 'milk_records', softDelete: false },
  breedingEvents: { table: 'breeding_events', softDelete: false },
  breedTypes: { table: 'breed_types', softDelete: false },
  issueTypes: { table: 'issue_type_definitions', softDelete: false },
}

// ── Process a Single Change ─────────────────────────────────────

async function processChange(entityType, action, id, data, clientUpdatedAt) {
  const mapping = ENTITY_MAP[entityType]
  if (!mapping) {
    return { id, entityType, status: 'error', error: `Unknown entity type: ${entityType}` }
  }

  const { table, softDelete } = mapping

  try {
    if (action === 'create') {
      return await handleCreate(table, id, data)
    } else if (action === 'update') {
      return await handleUpdate(table, entityType, id, data, clientUpdatedAt)
    } else if (action === 'delete') {
      return await handleDelete(table, entityType, id, softDelete)
    } else {
      return { id, entityType, status: 'error', error: `Unknown action: ${action}` }
    }
  } catch (err) {
    return { id, entityType, status: 'error', error: err.message }
  }
}

async function handleCreate(table, id, data) {
  const existing = await db(table).where({ id }).first()
  if (existing) {
    // Already exists — treat as update
    return { id, entityType: tableToEntity(table), status: 'applied', serverData: existing }
  }

  const now = new Date().toISOString()
  const row = { ...data, id, created_at: data.created_at || now, updated_at: now }

  // Remove any client-side-only fields
  delete row.autoId

  await db(table).insert(row)
  const created = await db(table).where({ id }).first()
  return { id, entityType: tableToEntity(table), status: 'applied', serverData: created }
}

async function handleUpdate(table, entityType, id, data, clientUpdatedAt) {
  const existing = await db(table).where({ id }).first()
  if (!existing) {
    return { id, entityType, status: 'error', error: 'Record not found' }
  }

  // Conflict check: last-write-wins
  const serverUpdatedAt = existing.updated_at
  if (serverUpdatedAt && clientUpdatedAt && serverUpdatedAt > clientUpdatedAt) {
    // Server is newer — conflict, return server version
    return { id, entityType, status: 'conflict', serverData: existing }
  }

  // Client is newer or equal — apply
  const now = new Date().toISOString()
  const updateData = { ...data, updated_at: now }

  // Remove immutable fields
  delete updateData.id
  delete updateData.created_at
  delete updateData.autoId

  await db(table).where({ id }).update(updateData)
  const updated = await db(table).where({ id }).first()
  return { id, entityType, status: 'applied', serverData: updated }
}

async function handleDelete(table, entityType, id, softDelete) {
  const existing = await db(table).where({ id }).first()
  if (!existing) {
    return { id, entityType, status: 'applied' } // Already gone
  }

  if (softDelete) {
    const now = new Date().toISOString()
    await db(table).where({ id }).update({ deleted_at: now, updated_at: now })
  } else {
    await db(table).where({ id }).delete()
  }

  return { id, entityType, status: 'applied' }
}

// ── Pull Data ───────────────────────────────────────────────────

async function pullData(since, full) {
  const result = {}
  const deleted = []

  for (const [entityType, { table, softDelete }] of Object.entries(ENTITY_MAP)) {
    let query = db(table)

    if (full) {
      // Full pull: return all non-deleted records
      if (softDelete) {
        query = query.whereNull('deleted_at')
      }
    } else if (since) {
      // Incremental: return records updated since timestamp
      query = query.where('updated_at', '>', since)
    } else {
      // No since and not full — return all
      if (softDelete) {
        query = query.whereNull('deleted_at')
      }
    }

    const rows = await query

    if (!full && since && softDelete) {
      // Also find soft-deleted records for the client to remove locally
      const deletedRows = await db(table)
        .whereNotNull('deleted_at')
        .where('updated_at', '>', since)
        .select('id')

      for (const row of deletedRows) {
        deleted.push({ entityType, id: row.id })
      }

      // Filter out soft-deleted from main results
      result[entityType] = rows.filter((r) => !r.deleted_at)
    } else {
      result[entityType] = rows
    }
  }

  return { ...result, deleted, syncedAt: new Date().toISOString() }
}

// ── Sync Log ────────────────────────────────────────────────────

async function logSync(userId, deviceId, action, recordsCount, status, errorMessage) {
  await db('sync_log').insert({
    id: uuidv4(),
    user_id: userId,
    device_id: deviceId,
    action,
    records_count: recordsCount,
    status,
    error_message: errorMessage || null,
    synced_at: new Date().toISOString(),
  })
}

// ── Helpers ─────────────────────────────────────────────────────

function tableToEntity(table) {
  for (const [entity, { table: t }] of Object.entries(ENTITY_MAP)) {
    if (t === table) return entity
  }
  return table
}

module.exports = { processChange, pullData, logSync, ENTITY_MAP }
