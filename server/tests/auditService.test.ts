const db = require('../config/database')
const { logAudit } = require('../services/auditService')
const { DEFAULT_FARM_ID, seedUsers } = require('./helpers/setup')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

describe('auditService', () => {
  it('logAudit() inserts a row into audit_log table', async () => {
    const entityId = `test-cow-${Date.now()}`
    await logAudit({
      farmId: DEFAULT_FARM_ID,
      userId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      action: 'create',
      entityType: 'cow',
      entityId,
      newValues: { name: 'Bessie' },
    })

    const rows = await db('audit_log').where({ entity_id: entityId })
    expect(rows.length).toBe(1)
    expect(rows[0].action).toBe('create')
    expect(rows[0].entity_type).toBe('cow')
    expect(JSON.parse(rows[0].new_values)).toEqual({ name: 'Bessie' })
  })

  it('logAudit() silently swallows errors (no throw)', async () => {
    // Pass null values that would normally cause issues — logAudit should not throw
    await expect(
      logAudit({
        userId: null,
        action: 'update',
        entityType: 'test',
        entityId: 'test-1',
      })
    ).resolves.toBeUndefined()
  })
})
