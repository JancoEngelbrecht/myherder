// Tests for server/cron/retention.js
// Uses the test DB (in-memory SQLite) seeded by knex migrations.
// Imports the exported runRetention() (not a child process) so it shares the
// same in-memory DB and we can verify row counts directly.

const db = require('../config/database')
const { seedUsers, DEFAULT_FARM_ID } = require('./helpers/setup')
const { randomUUID } = require('crypto')

// ── helpers ──────────────────────────────────────────────────────

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400 * 1000).toISOString()
}

async function insertAuditLog(createdAt: string, farmId = DEFAULT_FARM_ID) {
  await db('audit_log').insert({
    id: randomUUID(),
    user_id: null,
    action: 'test_action',
    entity_type: 'animal',
    entity_id: randomUUID(),
    created_at: createdAt,
    farm_id: farmId,
  })
}

async function insertSyncLog(syncedAt: string, userId: string, farmId = DEFAULT_FARM_ID) {
  await db('sync_log').insert({
    id: randomUUID(),
    user_id: userId,
    farm_id: farmId,
    device_id: 'test-device',
    action: 'push',
    records_count: 1,
    status: 'success',
    synced_at: syncedAt,
  })
}

// ── setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  await db.raw('PRAGMA foreign_keys = OFF')
  await db('sync_log').del()
  await db('audit_log').del()
  await db('users').del()
  await db('farms').del()
  await db.raw('PRAGMA foreign_keys = ON')
  await seedUsers(db)
})

afterAll(async () => {
  await db.destroy()
})

// ── runRetention helper ───────────────────────────────────────────
// Calls the real exported runRetention() against the test DB singleton.

const { runRetention } = require('../cron/retention')

function runRetentionWithDb(testDb: typeof db, opts: { dryRun?: boolean } = {}) {
  return runRetention(testDb, opts)
}

// ── tests ─────────────────────────────────────────────────────────

describe('retention cron — audit_log', () => {
  it('deletes audit_log rows older than 2 years', async () => {
    // Arrange — 3 old rows + 2 recent rows
    const OLD_DAYS = 2 * 365 + 10 // 740 days — comfortably past 2-year cutoff
    await insertAuditLog(daysAgo(OLD_DAYS))
    await insertAuditLog(daysAgo(OLD_DAYS + 5))
    await insertAuditLog(daysAgo(OLD_DAYS + 30))
    await insertAuditLog(daysAgo(30)) // recent — must survive
    await insertAuditLog(daysAgo(1)) // recent — must survive

    // Act
    const result = await runRetentionWithDb(db)

    // Assert
    expect(result.auditDeleted).toBe(3)
    const remaining = await db('audit_log').count('* as count').first()
    expect(Number(remaining!.count)).toBe(2)
  })

  it('leaves audit_log rows newer than 2 years untouched', async () => {
    // Arrange — all recent
    await insertAuditLog(daysAgo(300))
    await insertAuditLog(daysAgo(600))

    // Act
    const result = await runRetentionWithDb(db)

    // Assert
    expect(result.auditDeleted).toBe(0)
    const remaining = await db('audit_log').count('* as count').first()
    expect(Number(remaining!.count)).toBe(2)
  })

  it('handles empty audit_log without error', async () => {
    const result = await runRetentionWithDb(db)
    expect(result.auditDeleted).toBe(0)
  })
})

describe('retention cron — sync_log', () => {
  it('deletes sync_log rows older than 90 days', async () => {
    const { ADMIN_ID } = require('./helpers/setup')

    // Arrange — 2 old rows + 1 recent row
    await insertSyncLog(daysAgo(95), ADMIN_ID)
    await insertSyncLog(daysAgo(120), ADMIN_ID)
    await insertSyncLog(daysAgo(10), ADMIN_ID) // recent — must survive

    // Act
    const result = await runRetentionWithDb(db)

    // Assert
    expect(result.syncDeleted).toBe(2)
    const remaining = await db('sync_log').count('* as count').first()
    expect(Number(remaining!.count)).toBe(1)
  })

  it('leaves sync_log rows newer than 90 days untouched', async () => {
    const { ADMIN_ID } = require('./helpers/setup')

    await insertSyncLog(daysAgo(10), ADMIN_ID)
    await insertSyncLog(daysAgo(60), ADMIN_ID)
    await insertSyncLog(daysAgo(89), ADMIN_ID)

    const result = await runRetentionWithDb(db)

    expect(result.syncDeleted).toBe(0)
    const remaining = await db('sync_log').count('* as count').first()
    expect(Number(remaining!.count)).toBe(3)
  })

  it('handles empty sync_log without error', async () => {
    const result = await runRetentionWithDb(db)
    expect(result.syncDeleted).toBe(0)
  })
})

describe('retention cron — combined run', () => {
  it('deletes old rows from both tables in a single run', async () => {
    const { ADMIN_ID } = require('./helpers/setup')

    const OLD_AUDIT_DAYS = 2 * 365 + 10
    await insertAuditLog(daysAgo(OLD_AUDIT_DAYS))
    await insertAuditLog(daysAgo(30)) // recent

    await insertSyncLog(daysAgo(100), ADMIN_ID) // old
    await insertSyncLog(daysAgo(5), ADMIN_ID) // recent

    const result = await runRetentionWithDb(db)

    expect(result.auditDeleted).toBe(1)
    expect(result.syncDeleted).toBe(1)

    const auditCount = await db('audit_log').count('* as count').first()
    const syncCount = await db('sync_log').count('* as count').first()
    expect(Number(auditCount!.count)).toBe(1)
    expect(Number(syncCount!.count)).toBe(1)
  })
})

describe('retention cron — dry run', () => {
  it('counts stale rows without deleting them', async () => {
    const { ADMIN_ID } = require('./helpers/setup')

    await insertAuditLog(daysAgo(2 * 365 + 10))
    await insertAuditLog(daysAgo(5))
    await insertSyncLog(daysAgo(100), ADMIN_ID)

    const result = await runRetentionWithDb(db, { dryRun: true })

    expect(result.dryRun).toBe(true)
    expect(result.auditDeleted).toBe(1)
    expect(result.syncDeleted).toBe(1)
    const auditCount = await db('audit_log').count('* as count').first()
    const syncCount = await db('sync_log').count('* as count').first()
    expect(Number(auditCount!.count)).toBe(2)
    expect(Number(syncCount!.count)).toBe(1)
  })
})

describe('retention cron — batching', () => {
  it('deletes more rows than one batch across multiple passes', async () => {
    const { BATCH_SIZE } = require('../cron/retention')
    const old = daysAgo(2 * 365 + 10)
    const rows = Array.from({ length: BATCH_SIZE + 7 }, () => ({
      id: randomUUID(),
      user_id: null,
      action: 'bulk',
      entity_type: 'animal',
      entity_id: randomUUID(),
      created_at: old,
      farm_id: DEFAULT_FARM_ID,
    }))
    await db.batchInsert('audit_log', rows, 500)
    await insertAuditLog(daysAgo(1)) // recent — must survive

    const result = await runRetentionWithDb(db)

    expect(result.auditDeleted).toBe(BATCH_SIZE + 7)
    const remaining = await db('audit_log').count('* as count').first()
    expect(Number(remaining!.count)).toBe(1)
  })
})
