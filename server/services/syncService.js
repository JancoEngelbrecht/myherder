const db = require('../config/database')
const { randomUUID: uuidv4 } = require('crypto')

// ── Entity-to-Table Mapping ─────────────────────────────────────
//
// requiredRole: 'admin' means only admins may write this entity via sync.
// requiredPermission: workers need this permission to write the entity.
// allowedFields: only these columns may be written (unknown fields are silently dropped).

const ENTITY_MAP = {
  animals: {
    table: 'animals',
    softDelete: true,
    requiredRole: null,
    requiredPermission: 'can_manage_animals',
    allowedFields: [
      'tag_number',
      'name',
      'sex',
      'dob',
      'status',
      'breed_type_id',
      'sire_id',
      'dam_id',
      'breed',
      'life_phase_override',
      'species_id',
      'birth_event_id',
      'notes',
      'created_by',
      'created_at',
      'updated_at',
    ],
  },
  // Backward compat alias — accept 'cows' entity type for 1 release cycle
  // (clients with queued offline changes from before the rename)
  cows: {
    table: 'animals',
    softDelete: true,
    requiredRole: null,
    requiredPermission: 'can_manage_animals',
    allowedFields: [
      'tag_number',
      'name',
      'sex',
      'dob',
      'status',
      'breed_type_id',
      'sire_id',
      'dam_id',
      'breed',
      'life_phase_override',
      'species_id',
      'birth_event_id',
      'notes',
      'created_by',
      'created_at',
      'updated_at',
    ],
  },
  medications: {
    table: 'medications',
    softDelete: false,
    requiredRole: 'admin',
    requiredPermission: null,
    allowedFields: [
      'name',
      'active_ingredient',
      'unit',
      'default_dosage',
      'withdrawal_milk_days',
      'withdrawal_milk_hours',
      'withdrawal_meat_days',
      'withdrawal_meat_hours',
      'notes',
      'is_active',
      'created_at',
      'updated_at',
    ],
  },
  treatments: {
    table: 'treatments',
    softDelete: false,
    requiredRole: null,
    requiredPermission: 'can_log_treatments',
    ownerField: 'administered_by',
    allowedFields: [
      'animal_id',
      'medication_id',
      'dosage',
      'treatment_date',
      'is_vet_visit',
      'vet_name',
      'cost',
      'notes',
      'withdrawal_end_milk',
      'withdrawal_end_meat',
      'health_issue_id',
      'administered_by',
      'created_at',
      'updated_at',
    ],
  },
  healthIssues: {
    table: 'health_issues',
    softDelete: false,
    requiredRole: null,
    requiredPermission: 'can_log_issues',
    ownerField: 'reported_by',
    allowedFields: [
      'animal_id',
      'issue_types',
      'severity',
      'status',
      'description',
      'affected_teats',
      'observed_at',
      'resolved_at',
      'reported_by',
      'created_at',
      'updated_at',
    ],
  },
  milkRecords: {
    table: 'milk_records',
    softDelete: false,
    requiredRole: null,
    requiredPermission: 'can_record_milk',
    ownerField: 'recorded_by',
    allowedFields: [
      'animal_id',
      'recording_date',
      'session',
      'session_time',
      'litres',
      'milk_discarded',
      'discard_reason',
      'notes',
      'recorded_by',
      'created_at',
      'updated_at',
    ],
  },
  breedingEvents: {
    table: 'breeding_events',
    softDelete: false,
    requiredRole: null,
    requiredPermission: 'can_log_breeding',
    ownerField: 'recorded_by',
    allowedFields: [
      'animal_id',
      'event_type',
      'event_date',
      'notes',
      'sire_id',
      'semen_id',
      'inseminator',
      'heat_signs',
      'preg_check_method',
      'calving_details',
      'offspring_count',
      'cost',
      'expected_next_heat',
      'expected_preg_check',
      'expected_calving',
      'expected_dry_off',
      'dismissed_at',
      'dismissed_by',
      'dismiss_reason',
      'recorded_by',
      'created_at',
      'updated_at',
    ],
  },
  breedTypes: {
    table: 'breed_types',
    softDelete: false,
    requiredRole: 'admin',
    requiredPermission: null,
    allowedFields: [
      'name',
      'code',
      'species_id',
      'gestation_days',
      'heat_cycle_days',
      'preg_check_days',
      'dry_off_days',
      'voluntary_waiting_days',
      'calf_max_months',
      'heifer_min_months',
      'young_bull_min_months',
      'is_active',
      'sort_order',
      'created_at',
      'updated_at',
    ],
  },
  issueTypes: {
    table: 'issue_type_definitions',
    softDelete: false,
    requiredRole: 'admin',
    requiredPermission: null,
    allowedFields: [
      'name',
      'code',
      'emoji',
      'requires_teat_selection',
      'is_active',
      'sort_order',
      'created_at',
      'updated_at',
    ],
  },
}

// ── Permission Check ────────────────────────────────────────────

function checkPermission(entityType, user) {
  const mapping = ENTITY_MAP[entityType]
  if (!mapping) return null // unknown entity handled elsewhere

  // Admins and super-admins bypass all permission checks
  if (user.role === 'admin' || user.role === 'super_admin') return null

  // Role restriction (e.g. admin-only entities)
  if (mapping.requiredRole && user.role !== mapping.requiredRole) {
    return 'Insufficient permissions'
  }

  // Permission restriction
  if (mapping.requiredPermission) {
    const perms = Array.isArray(user.permissions) ? user.permissions : []
    if (!perms.includes(mapping.requiredPermission)) {
      return 'Insufficient permissions'
    }
  }

  return null
}

// ── Process a Single Change ─────────────────────────────────────

async function processChange(entityType, action, id, data, clientUpdatedAt, user, trx) {
  const qb = trx || db
  const mapping = ENTITY_MAP[entityType]
  if (!mapping) {
    return { id, entityType, status: 'error', error: `Unknown entity type: ${entityType}` }
  }

  // Permission gate
  const permError = checkPermission(entityType, user)
  if (permError) {
    return { id, entityType, status: 'error', error: permError }
  }

  const { table, softDelete, allowedFields } = mapping

  // Strip data to only allowed fields
  const safeData = data ? pickFields(data, allowedFields) : data

  try {
    if (action === 'create') {
      return await handleCreate(qb, table, entityType, id, safeData, user, mapping.ownerField)
    } else if (action === 'update') {
      return await handleUpdate(
        qb,
        table,
        entityType,
        id,
        safeData,
        clientUpdatedAt,
        user,
        mapping.ownerField
      )
    } else if (action === 'delete') {
      return await handleDelete(qb, table, entityType, id, softDelete, user, mapping.ownerField)
    } else {
      return { id, entityType, status: 'error', error: `Unknown action: ${action}` }
    }
  } catch (err) {
    console.error(`[sync] processChange error — entity=${entityType} id=${id}:`, err.message)
    return { id, entityType, status: 'error', error: 'Failed to apply change' }
  }
}

// ── Field Allowlist ─────────────────────────────────────────────

function pickFields(data, allowedFields) {
  const result = {}
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      result[field] = data[field]
    }
  }
  return result
}

async function handleCreate(qb, table, entityType, id, data, user, ownerField) {
  const existing = await qb(table).where({ id }).where('farm_id', user.farm_id).first()
  if (existing) {
    // Already exists — verify ownership before returning data
    if (ownerField && user && user.role !== 'admin' && existing[ownerField] !== user.id) {
      return {
        id,
        entityType,
        status: 'error',
        error: 'Cannot access records owned by another user',
      }
    }
    return { id, entityType, status: 'applied', serverData: existing }
  }

  // Milk records: check business-key uniqueness (animal_id + session + recording_date)
  if (table === 'milk_records' && data && data.animal_id && data.session && data.recording_date) {
    const duplicate = await qb(table)
      .where('farm_id', user.farm_id)
      .where('animal_id', data.animal_id)
      .where('session', data.session)
      .where('recording_date', data.recording_date)
      .first()
    if (duplicate) {
      return {
        id,
        entityType,
        status: 'conflict',
        serverData: duplicate,
        error: 'Duplicate milk record for this animal/session/date',
      }
    }
  }

  const now = new Date().toISOString()
  const row = { ...data, id, created_at: data.created_at || now, updated_at: now }

  // Enforce ownership: non-admin users must own their own records
  if (ownerField && user && user.role !== 'admin') {
    row[ownerField] = user.id
  }

  // Stamp farm_id from the authenticated user
  if (user && user.farm_id) {
    row.farm_id = user.farm_id
  }

  // Remove any client-side-only fields
  delete row.autoId

  await qb(table).insert(row)
  return { id, entityType, status: 'applied', serverData: row }
}

async function handleUpdate(qb, table, entityType, id, data, clientUpdatedAt, user, ownerField) {
  const existing = await qb(table).where({ id }).where('farm_id', user.farm_id).first()
  if (!existing) {
    return { id, entityType, status: 'error', error: 'Record not found' }
  }

  // Ownership check: non-admin users can only update their own records
  if (ownerField && user && user.role !== 'admin' && existing[ownerField] !== user.id) {
    return { id, entityType, status: 'error', error: 'Cannot modify records owned by another user' }
  }

  // Conflict check: last-write-wins (use Date objects for reliable comparison)
  const serverUpdatedAt = existing.updated_at
  if (serverUpdatedAt && clientUpdatedAt) {
    const serverTime = new Date(serverUpdatedAt).getTime()
    const clientTime = new Date(clientUpdatedAt).getTime()
    if (!isNaN(serverTime) && !isNaN(clientTime) && serverTime > clientTime) {
      // Server is newer — conflict, return server version
      return { id, entityType, status: 'conflict', serverData: existing }
    }
  }

  // Client is newer or equal — apply
  const now = new Date().toISOString()
  const updateData = { ...data, updated_at: now }

  // Track status change timestamp for animals
  if (table === 'animals' && updateData.status && updateData.status !== existing.status) {
    updateData.status_changed_at = now
  }

  // Remove immutable fields
  delete updateData.id
  delete updateData.created_at
  delete updateData.autoId

  await qb(table).where({ id }).where('farm_id', user.farm_id).update(updateData)
  return { id, entityType, status: 'applied', serverData: { ...existing, ...updateData } }
}

async function handleDelete(qb, table, entityType, id, softDelete, user, ownerField) {
  const existing = await qb(table).where({ id }).where('farm_id', user.farm_id).first()
  if (!existing) {
    return { id, entityType, status: 'applied' } // Already gone
  }

  // Ownership check: non-admin users can only delete their own records
  if (ownerField && user && user.role !== 'admin' && existing[ownerField] !== user.id) {
    return { id, entityType, status: 'error', error: 'Cannot delete records owned by another user' }
  }

  if (softDelete) {
    const now = new Date().toISOString()
    await qb(table)
      .where({ id })
      .where('farm_id', user.farm_id)
      .update({ deleted_at: now, updated_at: now })
  } else {
    await qb(table).where({ id }).where('farm_id', user.farm_id).delete()
  }

  return { id, entityType, status: 'applied' }
}

// ── Pull Data ───────────────────────────────────────────────────

// Permission-to-entity mapping for read access filtering.
// Reference data (cows, breedTypes, issueTypes) is always included.
// Other entities require the matching permission.
const ENTITY_READ_PERMISSIONS = {
  milkRecords: 'can_record_milk',
  treatments: 'can_log_treatments',
  medications: 'can_log_treatments',
  healthIssues: 'can_log_issues',
  breedingEvents: 'can_log_breeding',
}

async function pullData(since, full, farmId, user) {
  const deleted = []

  // Filter entities by user permissions (admin/super_admin bypass)
  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin')
  const userPerms = (user && user.permissions) || []
  const entries = Object.entries(ENTITY_MAP).filter(([entityType]) => {
    if (isAdmin) return true
    const requiredPerm = ENTITY_READ_PERMISSIONS[entityType]
    if (!requiredPerm) return true // reference data (animals, breedTypes, issueTypes)
    return userPerms.includes(requiredPerm)
  })

  // Run all entity queries in parallel
  const entityResults = await Promise.all(
    entries.map(async ([entityType, { table, softDelete }]) => {
      let query = db(table).where('farm_id', farmId)

      if (full) {
        // Full pull: return all non-deleted records
        if (softDelete) query = query.whereNull('deleted_at')
      } else if (since) {
        // Incremental: return records updated since timestamp
        query = query.where('updated_at', '>', since)
      } else {
        // No since and not full — return all non-deleted
        if (softDelete) query = query.whereNull('deleted_at')
      }

      const rows = await query

      if (!full && since && softDelete) {
        // Return ALL soft-deleted IDs so clients always reconcile stale records,
        // even if the deletion predates the client's last sync timestamp.
        const deletedRows = await db(table)
          .where('farm_id', farmId)
          .whereNotNull('deleted_at')
          .select('id')

        const entityDeleted = deletedRows.map((row) => ({ entityType, id: row.id }))
        return { entityType, rows: rows.filter((r) => !r.deleted_at), deleted: entityDeleted }
      }

      return { entityType, rows, deleted: [] }
    })
  )

  const result = {}
  for (const { entityType, rows, deleted: entityDeleted } of entityResults) {
    result[entityType] = rows
    deleted.push(...entityDeleted)
  }

  // Include species data (small static table, always included)
  let species = []
  try {
    species = await db('species').where('is_active', true).orderBy('sort_order')
    species = species.map((row) => {
      if (row.config && typeof row.config === 'string') {
        try {
          row.config = JSON.parse(row.config)
        } catch {
          row.config = {}
        }
      }
      return row
    })
  } catch {
    /* species table may not exist yet */
  }

  // Include farm's species assignment
  let farmSpecies = null
  try {
    farmSpecies = await db('farm_species').where('farm_id', farmId).first()
  } catch {
    /* farm_species table may not exist yet */
  }

  return { ...result, species, farmSpecies, deleted, syncedAt: new Date().toISOString() }
}

// ── Sync Log ────────────────────────────────────────────────────

async function logSync(userId, deviceId, action, recordsCount, status, errorMessage, farmId) {
  await db('sync_log').insert({
    id: uuidv4(),
    farm_id: farmId || null,
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

const TABLE_TO_ENTITY = Object.fromEntries(
  Object.entries(ENTITY_MAP).map(([entity, { table }]) => [table, entity])
)

// eslint-disable-next-line no-unused-vars
function tableToEntity(table) {
  return TABLE_TO_ENTITY[table] || table
}

module.exports = { processChange, pullData, logSync }
