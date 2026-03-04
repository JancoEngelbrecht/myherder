const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers } = require('./helpers/setup')
const { adminToken } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// Helper — inserts a cow and returns its id
async function createCow(overrides = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('cows').insert({
    id,
    tag_number: `SYNC-${id.slice(0, 8)}`,
    name: 'Sync Cow',
    sex: 'female',
    status: 'active',
    created_at: now,
    updated_at: now,
    ...overrides,
  })
  return id
}

// ─── GET /api/sync/health ──────────────────────────────────────────────────────

describe('GET /api/sync/health', () => {
  it('returns { ok, timestamp } without auth', async () => {
    const res = await request(app).get('/api/sync/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.timestamp).toBeDefined()
  })
})

// ─── POST /api/sync/push ───────────────────────────────────────────────────────

describe('POST /api/sync/push', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/api/sync/push')
      .send({ deviceId: randomUUID(), changes: [] })
    expect(res.status).toBe(401)
  })

  it('returns 400 with empty changes array (min 1 required)', async () => {
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({ deviceId: randomUUID(), changes: [] })
    expect(res.status).toBe(400)
  })

  it('creates a new cow via push', async () => {
    const cowId = randomUUID()
    const now = new Date().toISOString()

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'cows',
            action: 'create',
            id: cowId,
            data: {
              tag_number: `PUSH-${cowId.slice(0, 6)}`,
              name: 'Pushed Cow',
              sex: 'female',
              status: 'active',
            },
            updatedAt: now,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results).toHaveLength(1)
    expect(res.body.results[0].status).toBe('applied')
    expect(res.body.results[0].serverData.tag_number).toBe(`PUSH-${cowId.slice(0, 6)}`)
  })

  it('updates an existing cow via push', async () => {
    const cowId = await createCow({ name: 'Before Update' })
    const now = new Date().toISOString()

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'cows',
            action: 'update',
            id: cowId,
            data: { name: 'After Update' },
            updatedAt: now,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('applied')
    expect(res.body.results[0].serverData.name).toBe('After Update')
  })

  it('soft-deletes a cow via push (sets deleted_at)', async () => {
    const cowId = await createCow()
    const now = new Date().toISOString()

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'cows',
            action: 'delete',
            id: cowId,
            data: null,
            updatedAt: now,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('applied')

    // Verify it was soft-deleted
    const row = await db('cows').where({ id: cowId }).first()
    expect(row.deleted_at).not.toBeNull()
  })

  it('LWW: server row newer → returns conflict with server data', async () => {
    // Create a cow with a future updated_at
    const cowId = await createCow()
    const futureDate = '2099-01-01T00:00:00.000Z'
    await db('cows').where({ id: cowId }).update({ updated_at: futureDate })

    const oldDate = '2020-01-01T00:00:00.000Z'
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'cows',
            action: 'update',
            id: cowId,
            data: { name: 'Client Attempt' },
            updatedAt: oldDate,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('conflict')
    expect(res.body.results[0].serverData).toBeDefined()
  })

  it('LWW: client row newer → applies client data', async () => {
    const cowId = await createCow()
    const oldDate = '2020-01-01T00:00:00.000Z'
    await db('cows').where({ id: cowId }).update({ updated_at: oldDate })

    const newerDate = '2099-01-01T00:00:00.000Z'
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'cows',
            action: 'update',
            id: cowId,
            data: { name: 'Client Wins' },
            updatedAt: newerDate,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('applied')
    expect(res.body.results[0].serverData.name).toBe('Client Wins')
  })

  it('returns error for invalid entityType per item', async () => {
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'unicorns',
            action: 'create',
            id: randomUUID(),
            data: {},
            updatedAt: null,
          },
        ],
      })

    // Joi rejects invalid entityType at validation level
    expect(res.status).toBe(400)
  })

  it('handles mixed batch (some succeed, some fail)', async () => {
    const cowId = await createCow()
    const now = new Date().toISOString()

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'cows',
            action: 'update',
            id: cowId,
            data: { name: 'Good Update' },
            updatedAt: now,
          },
          {
            entityType: 'cows',
            action: 'update',
            id: randomUUID(), // non-existent
            data: { name: 'Bad Update' },
            updatedAt: now,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results).toHaveLength(2)
    expect(res.body.results[0].status).toBe('applied')
    expect(res.body.results[1].status).toBe('error')
  })
})

// ─── GET /api/sync/pull ────────────────────────────────────────────────────────

describe('GET /api/sync/pull', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/sync/pull')
    expect(res.status).toBe(401)
  })

  it('returns all entity types in response', async () => {
    const res = await request(app)
      .get('/api/sync/pull')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('cows')
    expect(res.body).toHaveProperty('medications')
    expect(res.body).toHaveProperty('treatments')
    expect(res.body).toHaveProperty('healthIssues')
    expect(res.body).toHaveProperty('milkRecords')
    expect(res.body).toHaveProperty('breedingEvents')
    expect(res.body).toHaveProperty('breedTypes')
    expect(res.body).toHaveProperty('issueTypes')
    expect(res.body).toHaveProperty('deleted')
    expect(res.body).toHaveProperty('syncedAt')
  })

  it('incremental pull returns only rows updated after since', async () => {
    // Create a cow with a known old date
    const cowId = await createCow({ name: 'Old Cow' })
    const oldDate = '2020-01-01T00:00:00.000Z'
    await db('cows').where({ id: cowId }).update({ updated_at: oldDate })

    // Create a cow with a recent date
    const recentId = await createCow({ name: 'Recent Cow' })
    const recentDate = '2099-01-01T00:00:00.000Z'
    await db('cows').where({ id: recentId }).update({ updated_at: recentDate })

    const res = await request(app)
      .get('/api/sync/pull?since=2050-01-01T00:00:00.000Z')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const cowIds = res.body.cows.map((c) => c.id)
    expect(cowIds).toContain(recentId)
    expect(cowIds).not.toContain(cowId)
  })

  it('full=1 ignores since param and returns all', async () => {
    const res = await request(app)
      .get('/api/sync/pull?since=2099-01-01T00:00:00.000Z&full=1')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // With full=1, should still return results even with a far-future since
    expect(Array.isArray(res.body.cows)).toBe(true)
    expect(res.body.cows.length).toBeGreaterThan(0)
  })

  it('includes soft-deleted items in deleted array during incremental pull', async () => {
    const cowId = await createCow({ name: 'To Delete For Sync' })
    const now = new Date().toISOString()
    await db('cows').where({ id: cowId }).update({
      deleted_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .get(`/api/sync/pull?since=2020-01-01T00:00:00.000Z`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const deletedIds = res.body.deleted.map((d) => d.id)
    expect(deletedIds).toContain(cowId)
  })
})
