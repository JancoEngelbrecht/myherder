const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers, ADMIN_ID } = require('./helpers/setup')
const { adminToken, workerToken } = require('./helpers/tokens')
const { logAudit } = require('../services/auditService')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ─── logAudit service ──────────────────────────────────────────────────────

describe('logAudit()', () => {
  it('inserts an audit entry into the database', async () => {
    await logAudit({
      userId: ADMIN_ID,
      action: 'create',
      entityType: 'cow',
      entityId: 'cow-1',
      newValues: { name: 'Bessie' },
    })

    const row = await db('audit_log').where({ entity_id: 'cow-1' }).first()
    expect(row).toBeTruthy()
    expect(row.action).toBe('create')
    expect(row.entity_type).toBe('cow')
    expect(JSON.parse(row.new_values)).toEqual({ name: 'Bessie' })
    expect(row.old_values).toBeNull()
  })

  it('stores old_values for updates', async () => {
    await logAudit({
      userId: ADMIN_ID,
      action: 'update',
      entityType: 'cow',
      entityId: 'cow-2',
      oldValues: { name: 'Old' },
      newValues: { name: 'New' },
    })

    const row = await db('audit_log').where({ entity_id: 'cow-2' }).first()
    expect(JSON.parse(row.old_values)).toEqual({ name: 'Old' })
    expect(JSON.parse(row.new_values)).toEqual({ name: 'New' })
  })

  it('does not throw on error (best-effort)', async () => {
    // Pass invalid userId — FK constraint may fail but should not throw
    await expect(
      logAudit({
        userId: 'nonexistent-user-id-that-is-way-too-long-for-the-column-and-will-not-match-fk',
        action: 'create',
        entityType: 'test',
        entityId: 'test-1',
      }),
    ).resolves.not.toThrow()
  })
})

// ─── GET /api/audit-log ─────────────────────────────────────────────────────

describe('GET /api/audit-log', () => {
  beforeAll(async () => {
    // Seed some audit entries
    await db('audit_log').del()
    const entries = []
    for (let i = 0; i < 30; i++) {
      entries.push({
        id: `audit-${i}`,
        user_id: ADMIN_ID,
        action: i % 3 === 0 ? 'create' : i % 3 === 1 ? 'update' : 'delete',
        entity_type: i < 20 ? 'cow' : 'user',
        entity_id: `entity-${i}`,
        old_values: i % 2 === 0 ? JSON.stringify({ x: i }) : null,
        new_values: JSON.stringify({ y: i }),
        created_at: new Date(Date.now() - (30 - i) * 60000).toISOString(),
      })
    }
    await db('audit_log').insert(entries)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/audit-log')
    expect(res.status).toBe(401)
  })

  it('returns 403 for a worker token', async () => {
    const res = await request(app)
      .get('/api/audit-log')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('returns paginated results with total', async () => {
    const res = await request(app)
      .get('/api/audit-log')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('data')
    expect(res.body).toHaveProperty('total', 30)
    expect(res.body.data).toHaveLength(25) // default page size
  })

  it('respects page and limit params', async () => {
    const res = await request(app)
      .get('/api/audit-log?page=2&limit=10')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(10)
    expect(res.body.total).toBe(30)
  })

  it('filters by entity_type', async () => {
    const res = await request(app)
      .get('/api/audit-log?entity_type=user')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(10)
    res.body.data.forEach((entry) => {
      expect(entry.entity_type).toBe('user')
    })
  })

  it('filters by action', async () => {
    const res = await request(app)
      .get('/api/audit-log?action=create')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    res.body.data.forEach((entry) => {
      expect(entry.action).toBe('create')
    })
  })

  it('parses JSON old_values and new_values', async () => {
    const res = await request(app)
      .get('/api/audit-log?limit=5')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    res.body.data.forEach((entry) => {
      if (entry.new_values) {
        expect(typeof entry.new_values).toBe('object')
      }
      if (entry.old_values) {
        expect(typeof entry.old_values).toBe('object')
      }
    })
  })

  it('returns results ordered by created_at desc', async () => {
    const res = await request(app)
      .get('/api/audit-log?limit=5')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    const dates = res.body.data.map((e) => new Date(e.created_at).getTime())
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i])
    }
  })

  it('includes user info from join', async () => {
    const res = await request(app)
      .get('/api/audit-log?limit=1')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.body.data[0]).toHaveProperty('user_username')
    expect(res.body.data[0]).toHaveProperty('user_full_name')
  })

  it('returns 400 for unknown query param', async () => {
    const res = await request(app)
      .get('/api/audit-log?bogus=1')
      .set('Authorization', adminToken())
    expect(res.status).toBe(400)
  })
})
