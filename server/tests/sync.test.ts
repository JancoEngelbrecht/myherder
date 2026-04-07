const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const {
  WORKER_ID,
  DEFAULT_FARM_ID,
  seedUsers,
  seedFarmUser,
  tokenForFarm,
} = require('./helpers/setup')
const { adminToken, workerToken, workerTokenWith } = require('./helpers/tokens')

// Second worker for ownership tests
let WORKER_B_ID
let workerBToken

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
  // Create second worker for ownership tests
  WORKER_B_ID = await seedFarmUser(db, DEFAULT_FARM_ID, {
    username: 'worker_b',
    pin: '5678',
    role: 'worker',
  })
  workerBToken = tokenForFarm(DEFAULT_FARM_ID, WORKER_B_ID, {
    role: 'worker',
    username: 'worker_b',
  })
})

afterAll(() => db.destroy())

// Helper — inserts a cow and returns its id
async function createAnimal(overrides = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('animals').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
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

  it('creates a new animal via push', async () => {
    const newId = randomUUID()
    const now = new Date().toISOString()

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'animals',
            action: 'create',
            id: newId,
            data: {
              tag_number: `PUSH-${newId.slice(0, 6)}`,
              name: 'Pushed Animal',
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
    expect(res.body.results[0].serverData.tag_number).toBe(`PUSH-${newId.slice(0, 6)}`)
  })

  it('updates an existing cow via push', async () => {
    const animalId = await createAnimal({ name: 'Before Update' })
    const now = new Date().toISOString()

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'animals',
            action: 'update',
            id: animalId,
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
    const animalId = await createAnimal()
    const now = new Date().toISOString()

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'animals',
            action: 'delete',
            id: animalId,
            data: null,
            updatedAt: now,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('applied')

    // Verify it was soft-deleted
    const row = await db('animals').where({ id: animalId }).first()
    expect(row.deleted_at).not.toBeNull()
  })

  it('LWW: server row newer → returns conflict with server data', async () => {
    // Create a cow with a future updated_at
    const animalId = await createAnimal()
    const futureDate = '2099-01-01T00:00:00.000Z'
    await db('animals').where({ id: animalId }).update({ updated_at: futureDate })

    const oldDate = '2020-01-01T00:00:00.000Z'
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'animals',
            action: 'update',
            id: animalId,
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
    const animalId = await createAnimal()
    const oldDate = '2020-01-01T00:00:00.000Z'
    await db('animals').where({ id: animalId }).update({ updated_at: oldDate })

    const newerDate = '2099-01-01T00:00:00.000Z'
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'animals',
            action: 'update',
            id: animalId,
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

  it('accepts legacy entityType "cows" for backward compatibility', async () => {
    // Sync push with the old entity type 'cows' must still work for 1 release cycle
    const newId = randomUUID()
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
            id: newId,
            data: {
              tag_number: `LEGCY-${newId.slice(0, 6)}`,
              name: 'Legacy Compat Animal',
              sex: 'female',
              status: 'active',
            },
            updatedAt: now,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('applied')
    // Verify the row was actually written to the animals table
    const row = await db('animals').where({ id: newId }).first()
    expect(row).toBeDefined()
    expect(row.tag_number).toBe(`LEGCY-${newId.slice(0, 6)}`)
  })

  it('returns generic error message (not raw DB details) for invalid data', async () => {
    // Send a cow create with a duplicate tag_number to trigger a DB constraint error.
    // The server should log internally but only return a generic message to the client.
    const id = randomUUID()
    const now = new Date().toISOString()
    await db('animals').insert({
      id: randomUUID(),
      farm_id: DEFAULT_FARM_ID,
      tag_number: 'DUP-TAG-SYNC',
      sex: 'female',
      status: 'active',
      created_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'animals',
            action: 'create',
            id,
            data: { tag_number: 'DUP-TAG-SYNC', name: 'Dup Cow', sex: 'female', status: 'active' },
            updatedAt: now,
          },
        ],
      })

    expect(res.status).toBe(200)
    const result = res.body.results[0]
    expect(result.status).toBe('error')
    // Must not leak column names or SQL details
    expect(result.error).toBe('Failed to apply change')
    expect(result.error).not.toMatch(/UNIQUE/i)
    expect(result.error).not.toMatch(/tag_number/i)
  })

  it('handles mixed batch (some succeed, some fail)', async () => {
    const animalId = await createAnimal()
    const now = new Date().toISOString()

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'animals',
            action: 'update',
            id: animalId,
            data: { name: 'Good Update' },
            updatedAt: now,
          },
          {
            entityType: 'animals',
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

// ─── POST /api/sync/push — permission checks ───────────────────────────────────

describe('POST /api/sync/push — permission checks', () => {
  it('worker cannot sync breedTypes changes (admin-only entity)', async () => {
    const id = randomUUID()
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', workerToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'breedTypes',
            action: 'create',
            id,
            data: { name: 'Test Breed', code: 'test_breed', gestation_days: 283 },
            updatedAt: new Date().toISOString(),
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('error')
    expect(res.body.results[0].error).toBe('Insufficient permissions')

    // Verify the row was NOT created
    const row = await db('breed_types').where({ id }).first()
    expect(row).toBeUndefined()
  })

  it('worker cannot sync issueTypes changes (admin-only entity)', async () => {
    const id = randomUUID()
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', workerToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'issueTypes',
            action: 'create',
            id,
            data: { name: 'Bad Issue', code: 'bad_issue', emoji: '🦠' },
            updatedAt: new Date().toISOString(),
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('error')
    expect(res.body.results[0].error).toBe('Insufficient permissions')
  })

  it('worker cannot sync medications changes (admin-only entity)', async () => {
    const id = randomUUID()
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', workerToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'medications',
            action: 'create',
            id,
            data: { name: 'Bad Meds', unit: 'ml', withdrawal_milk_days: 0 },
            updatedAt: new Date().toISOString(),
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('error')
    expect(res.body.results[0].error).toBe('Insufficient permissions')
  })

  it('worker with can_record_milk can sync milkRecords', async () => {
    // Insert a cow so the FK resolves
    const newId = randomUUID()
    const now = new Date().toISOString()
    await db('animals').insert({
      id: newId,
      farm_id: DEFAULT_FARM_ID,
      tag_number: `PERM-${newId.slice(0, 6)}`,
      name: 'Perm Animal',
      sex: 'female',
      status: 'active',
      created_at: now,
      updated_at: now,
    })

    const recordId = randomUUID()
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', workerToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'milkRecords',
            action: 'create',
            id: recordId,
            data: {
              animal_id: newId,
              recording_date: '2024-01-15',
              session: 'morning',
              litres: 12.5,
              milk_discarded: 0,
              recorded_by: WORKER_ID,
            },
            updatedAt: now,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('applied')
  })

  it('admin can sync breedTypes changes', async () => {
    const id = randomUUID()
    const now = new Date().toISOString()
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'breedTypes',
            action: 'create',
            id,
            data: {
              name: 'Admin Breed',
              code: `admin_breed_${id.slice(0, 6)}`,
              gestation_days: 283,
              is_active: true,
              created_at: now,
              updated_at: now,
            },
            updatedAt: now,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('applied')
  })

  it('strips unknown fields from payload before writing', async () => {
    const newId = randomUUID()
    const now = new Date().toISOString()
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'animals',
            action: 'create',
            id: newId,
            data: {
              tag_number: `STRIP-${newId.slice(0, 6)}`,
              name: 'Strip Test',
              sex: 'female',
              status: 'active',
              __unknownField: 'should be dropped',
              injectedColumn: 'DROP ME',
            },
            updatedAt: now,
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('applied')
    // The unknown fields must not appear on the saved row
    const row = await db('animals').where({ id: newId }).first()
    expect(row).toBeDefined()
    expect(row['__unknownField']).toBeUndefined()
    expect(row['injectedColumn']).toBeUndefined()
  })
})

// ─── GET /api/sync/pull ────────────────────────────────────────────────────────

describe('GET /api/sync/pull', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/sync/pull')
    expect(res.status).toBe(401)
  })

  it('returns all entity types in response', async () => {
    const res = await request(app).get('/api/sync/pull').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('animals')
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
    const animalId = await createAnimal({ name: 'Old Cow' })
    const oldDate = '2020-01-01T00:00:00.000Z'
    await db('animals').where({ id: animalId }).update({ updated_at: oldDate })

    // Create a cow with a recent date
    const recentId = await createAnimal({ name: 'Recent Cow' })
    const recentDate = '2099-01-01T00:00:00.000Z'
    await db('animals').where({ id: recentId }).update({ updated_at: recentDate })

    const res = await request(app)
      .get('/api/sync/pull?since=2050-01-01T00:00:00.000Z')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const animalIds = res.body.animals.map((c) => c.id)
    expect(animalIds).toContain(recentId)
    expect(animalIds).not.toContain(animalId)
  })

  it('full=1 ignores since param and returns all', async () => {
    const res = await request(app)
      .get('/api/sync/pull?since=2099-01-01T00:00:00.000Z&full=1')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // With full=1, should still return results even with a far-future since
    expect(Array.isArray(res.body.animals)).toBe(true)
    expect(res.body.animals.length).toBeGreaterThan(0)
  })

  it('includes soft-deleted items in deleted array during incremental pull', async () => {
    const animalId = await createAnimal({ name: 'To Delete For Sync' })
    const now = new Date().toISOString()
    await db('animals').where({ id: animalId }).update({
      deleted_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .get(`/api/sync/pull?since=2020-01-01T00:00:00.000Z`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const deletedIds = res.body.deleted.map((d) => d.id)
    expect(deletedIds).toContain(animalId)
  })
})

// ─── Ownership checks ─────────────────────────────────────────────────────────

describe('POST /api/sync/push — ownership enforcement', () => {
  let animalId

  beforeAll(async () => {
    animalId = await createAnimal()
  })

  afterAll(async () => {
    await db('milk_records').where('animal_id', animalId).del()
    await db('animals').where('id', animalId).del()
  })

  it('blocks worker B from updating worker A milk record', async () => {
    const recordId = randomUUID()
    const now = new Date().toISOString()
    await db('milk_records').insert({
      id: recordId,
      farm_id: DEFAULT_FARM_ID,
      animal_id: animalId,
      recording_date: '2026-03-01',
      session: 'morning',
      litres: 5,
      recorded_by: WORKER_ID, // Worker A owns this
      created_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', workerBToken) // Worker B tries to update
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'milkRecords',
            action: 'update',
            id: recordId,
            data: { litres: 10 },
            updatedAt: new Date().toISOString(),
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('error')
    expect(res.body.results[0].error).toContain('Cannot modify records owned by another user')

    // Verify DB was not changed
    const record = await db('milk_records').where('id', recordId).first()
    expect(record.litres).toBe(5)

    await db('milk_records').where('id', recordId).del()
  })

  it('blocks worker B from deleting worker A milk record', async () => {
    const recordId = randomUUID()
    const now = new Date().toISOString()
    await db('milk_records').insert({
      id: recordId,
      farm_id: DEFAULT_FARM_ID,
      animal_id: animalId,
      recording_date: '2026-03-02',
      session: 'morning',
      litres: 7,
      recorded_by: WORKER_ID,
      created_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', workerBToken)
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'milkRecords',
            action: 'delete',
            id: recordId,
            updatedAt: new Date().toISOString(),
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('error')
    expect(res.body.results[0].error).toContain('Cannot delete records owned by another user')

    // Record still exists
    const record = await db('milk_records').where('id', recordId).first()
    expect(record).toBeTruthy()

    await db('milk_records').where('id', recordId).del()
  })

  it('allows admin to update any worker milk record', async () => {
    const recordId = randomUUID()
    const now = new Date().toISOString()
    await db('milk_records').insert({
      id: recordId,
      farm_id: DEFAULT_FARM_ID,
      animal_id: animalId,
      recording_date: '2026-03-03',
      session: 'morning',
      litres: 5,
      recorded_by: WORKER_ID,
      created_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', adminToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'milkRecords',
            action: 'update',
            id: recordId,
            data: { litres: 15 },
            updatedAt: new Date().toISOString(),
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('applied')

    await db('milk_records').where('id', recordId).del()
  })

  it('allows worker to update their OWN record', async () => {
    const recordId = randomUUID()
    const now = new Date().toISOString()
    await db('milk_records').insert({
      id: recordId,
      farm_id: DEFAULT_FARM_ID,
      animal_id: animalId,
      recording_date: '2026-03-04',
      session: 'morning',
      litres: 5,
      recorded_by: WORKER_ID,
      created_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', workerToken())
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'milkRecords',
            action: 'update',
            id: recordId,
            data: { litres: 8 },
            updatedAt: new Date().toISOString(),
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.results[0].status).toBe('applied')

    await db('milk_records').where('id', recordId).del()
  })
})

describe('GET /api/sync/pull permission filtering', () => {
  it('returns only permitted entities for worker with can_record_milk only', async () => {
    const token = workerTokenWith(['can_record_milk'])
    const res = await request(app).get('/api/sync/pull?full=1').set('Authorization', token)

    expect(res.status).toBe(200)
    // Reference data always included
    expect(res.body).toHaveProperty('animals')
    expect(res.body).toHaveProperty('breedTypes')
    expect(res.body).toHaveProperty('issueTypes')
    // Permitted entity included
    expect(res.body).toHaveProperty('milkRecords')
    // Unpermitted entities omitted
    expect(res.body).not.toHaveProperty('treatments')
    expect(res.body).not.toHaveProperty('medications')
    expect(res.body).not.toHaveProperty('healthIssues')
    expect(res.body).not.toHaveProperty('breedingEvents')
  })

  it('returns all entities for admin', async () => {
    const res = await request(app).get('/api/sync/pull?full=1').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('animals')
    expect(res.body).toHaveProperty('treatments')
    expect(res.body).toHaveProperty('medications')
    expect(res.body).toHaveProperty('healthIssues')
    expect(res.body).toHaveProperty('breedingEvents')
    expect(res.body).toHaveProperty('milkRecords')
    expect(res.body).toHaveProperty('breedTypes')
    expect(res.body).toHaveProperty('issueTypes')
  })

  it('returns only reference data for worker with no permissions', async () => {
    const token = workerTokenWith([])
    const res = await request(app).get('/api/sync/pull?full=1').set('Authorization', token)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('animals')
    expect(res.body).toHaveProperty('breedTypes')
    expect(res.body).toHaveProperty('issueTypes')
    expect(res.body).not.toHaveProperty('treatments')
    expect(res.body).not.toHaveProperty('medications')
    expect(res.body).not.toHaveProperty('healthIssues')
    expect(res.body).not.toHaveProperty('breedingEvents')
    expect(res.body).not.toHaveProperty('milkRecords')
  })
})
