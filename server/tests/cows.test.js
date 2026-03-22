const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken, workerToken } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// Helper — inserts a cow row and returns its id
async function createCow(overrides = {}) {
  const id = randomUUID()
  await db('cows').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    tag_number: `TAG-${id.slice(0, 8)}`,
    name: 'Test Cow',
    sex: 'female',
    status: 'active',
    ...overrides,
  })
  return id
}

// ─── GET /api/cows ─────────────────────────────────────────────────────────────

describe('GET /api/cows', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/cows')
    expect(res.status).toBe(401)
  })

  it('returns a plain array of cows', async () => {
    const res = await request(app).get('/api/cows').set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('filters by search query (tag and name)', async () => {
    const tag = `SRCH-${randomUUID().slice(0, 6)}`
    await createCow({ tag_number: tag, name: 'Searchable' })

    const res = await request(app).get(`/api/cows?search=${tag}`).set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.some((c) => c.tag_number === tag)).toBe(true)
  })

  it('filters by status', async () => {
    await createCow({ tag_number: `SICK-${randomUUID().slice(0, 6)}`, status: 'sick' })

    const res = await request(app).get('/api/cows?status=sick').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.every((c) => c.status === 'sick')).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('respects pagination (limit + page)', async () => {
    // Insert enough cows so there is more than 1 page worth
    for (let i = 0; i < 3; i++) {
      await createCow({ tag_number: `PAGE-${randomUUID().slice(0, 6)}` })
    }

    const res = await request(app)
      .get('/api/cows?limit=2&page=1')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(2)
  })
})

// ─── GET /api/cows/:id ─────────────────────────────────────────────────────────

describe('GET /api/cows/:id', () => {
  it('returns a single cow with sire_name and dam_name', async () => {
    const sireId = await createCow({
      tag_number: `SIRE-${randomUUID().slice(0, 6)}`,
      sex: 'male',
      name: 'Big Bull',
    })
    const cowId = await createCow({
      tag_number: `CALF-${randomUUID().slice(0, 6)}`,
      sire_id: sireId,
    })

    const res = await request(app).get(`/api/cows/${cowId}`).set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(cowId)
    expect(res.body.sire_name).toBe('Big Bull')
    expect(res.body.dam_name).toBeNull()
  })

  it('returns 404 for a nonexistent cow', async () => {
    const res = await request(app)
      .get(`/api/cows/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })
})

// ─── POST /api/cows ────────────────────────────────────────────────────────────

describe('POST /api/cows', () => {
  it('creates a cow and returns 201', async () => {
    const tag = `NEW-${randomUUID().slice(0, 6)}`
    const res = await request(app)
      .post('/api/cows')
      .set('Authorization', adminToken())
      .send({ tag_number: tag, name: 'Bessie', sex: 'female', status: 'active' })

    expect(res.status).toBe(201)
    expect(res.body.tag_number).toBe(tag)
    expect(res.body.id).toBeDefined()
  })

  it('returns 409 when tag_number is a duplicate', async () => {
    const tag = `DUP-${randomUUID().slice(0, 6)}`
    await createCow({ tag_number: tag })

    const res = await request(app)
      .post('/api/cows')
      .set('Authorization', adminToken())
      .send({ tag_number: tag })

    expect(res.status).toBe(409)
  })

  it('returns 400 for missing tag_number', async () => {
    const res = await request(app)
      .post('/api/cows')
      .set('Authorization', adminToken())
      .send({ name: 'No Tag' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .post('/api/cows')
      .set('Authorization', adminToken())
      .send({ tag_number: `BAD-${randomUUID().slice(0, 6)}`, status: 'unicorn' })

    expect(res.status).toBe(400)
  })

  it('returns 403 for a worker without can_manage_cows permission', async () => {
    // Inline worker token with no permissions (must use real user ID for token_version check)
    const jwt = require('jsonwebtoken')
    const { jwtSecret } = require('../config/env')
    const { WORKER_ID, DEFAULT_FARM_ID } = require('./helpers/setup')
    const noPermToken = `Bearer ${jwt.sign(
      {
        id: WORKER_ID,
        farm_id: DEFAULT_FARM_ID,
        role: 'worker',
        permissions: [],
        token_version: 0,
      },
      jwtSecret,
      { expiresIn: '1h' }
    )}`

    const res = await request(app)
      .post('/api/cows')
      .set('Authorization', noPermToken)
      .send({ tag_number: `DENY-${randomUUID().slice(0, 6)}` })

    expect(res.status).toBe(403)
  })
})

// ─── PUT /api/cows/:id ─────────────────────────────────────────────────────────

describe('PUT /api/cows/:id', () => {
  it('updates the cow and returns 200', async () => {
    const id = await createCow({ tag_number: `UPD-${randomUUID().slice(0, 6)}`, name: 'Old Name' })

    const res = await request(app)
      .put(`/api/cows/${id}`)
      .set('Authorization', adminToken())
      .send({ name: 'New Name', status: 'dry' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New Name')
    expect(res.body.status).toBe('dry')
  })

  it('returns 404 for a nonexistent cow', async () => {
    const res = await request(app)
      .put(`/api/cows/${randomUUID()}`)
      .set('Authorization', adminToken())
      .send({ name: 'Ghost' })

    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/cows/:id ──────────────────────────────────────────────────────

describe('DELETE /api/cows/:id', () => {
  it('soft-deletes the cow (admin)', async () => {
    const id = await createCow({ tag_number: `DEL-${randomUUID().slice(0, 6)}` })

    const res = await request(app).delete(`/api/cows/${id}`).set('Authorization', adminToken())

    expect(res.status).toBe(200)

    // Should no longer appear in listings
    const listRes = await request(app).get('/api/cows').set('Authorization', adminToken())
    expect(listRes.body.find((c) => c.id === id)).toBeUndefined()
  })

  it('returns 403 for a worker token', async () => {
    const id = await createCow({ tag_number: `WDEL-${randomUUID().slice(0, 6)}` })

    const res = await request(app).delete(`/api/cows/${id}`).set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })
})

// ─── Species-aware cow tests ────────────────────────────────────────────────

describe('POST /api/cows — species_id auto-set from breed_type', () => {
  it('auto-sets species_id from breed_type_id on create', async () => {
    const cattle = await db('species').where({ code: 'cattle' }).first()
    const btId = randomUUID()
    const now = new Date().toISOString()
    await db('breed_types').insert({
      id: btId,
      farm_id: DEFAULT_FARM_ID,
      code: `auto_sp_${btId.slice(0, 6)}`,
      name: `AutoSp-${btId.slice(0, 6)}`,
      species_id: cattle.id,
      is_active: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    })

    const tag = `SPTEST-${randomUUID().slice(0, 6)}`
    const res = await request(app)
      .post('/api/cows')
      .set('Authorization', adminToken())
      .send({ tag_number: tag, sex: 'female', breed_type_id: btId })

    expect(res.status).toBe(201)
    const row = await db('cows').where({ id: res.body.id }).first()
    expect(row.species_id).toBe(cattle.id)
  })

  it('accepts birth_event_id linking an offspring to a birth event', async () => {
    const cowId = await createCow({ tag_number: `DAM-${randomUUID().slice(0, 6)}` })
    const birthEventId = randomUUID()
    const now = new Date().toISOString()
    await db('breeding_events').insert({
      id: birthEventId,
      farm_id: DEFAULT_FARM_ID,
      cow_id: cowId,
      event_type: 'calving',
      event_date: '2026-01-15T08:00',
      offspring_count: 1,
      recorded_by: (await db('users').where('farm_id', DEFAULT_FARM_ID).first()).id,
      created_at: now,
      updated_at: now,
    })

    const tag = `OFFSPRING-${randomUUID().slice(0, 6)}`
    const res = await request(app)
      .post('/api/cows')
      .set('Authorization', adminToken())
      .send({ tag_number: tag, sex: 'female', birth_event_id: birthEventId })

    expect(res.status).toBe(201)
    const row = await db('cows').where({ id: res.body.id }).first()
    expect(row.birth_event_id).toBe(birthEventId)
  })
})

describe('GET /api/cows — species filter', () => {
  it('filters cows by species_id', async () => {
    const cattle = await db('species').where({ code: 'cattle' }).first()
    const sheep = await db('species').where({ code: 'sheep' }).first()

    const cattleCowId = await createCow({
      tag_number: `CATTLESP-${randomUUID().slice(0, 6)}`,
      species_id: cattle.id,
    })
    const sheepCowId = await createCow({
      tag_number: `SHEEPSP-${randomUUID().slice(0, 6)}`,
      species_id: sheep.id,
    })

    const res = await request(app)
      .get(`/api/cows?species_id=${cattle.id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const ids = res.body.map((c) => c.id)
    expect(ids).toContain(cattleCowId)
    expect(ids).not.toContain(sheepCowId)
  })

  it('filters offspring by birth_event_id', async () => {
    const damId = await createCow({ tag_number: `DAM2-${randomUUID().slice(0, 6)}` })
    const evId = randomUUID()
    const now = new Date().toISOString()
    await db('breeding_events').insert({
      id: evId,
      farm_id: DEFAULT_FARM_ID,
      cow_id: damId,
      event_type: 'calving',
      event_date: '2026-02-01T08:00',
      offspring_count: 2,
      recorded_by: (await db('users').where('farm_id', DEFAULT_FARM_ID).first()).id,
      created_at: now,
      updated_at: now,
    })

    const offspring1 = await createCow({
      tag_number: `OFF1-${randomUUID().slice(0, 6)}`,
      birth_event_id: evId,
    })
    const unrelated = await createCow({
      tag_number: `UNREL-${randomUUID().slice(0, 6)}`,
    })

    const res = await request(app)
      .get(`/api/cows?birth_event_id=${evId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const ids = res.body.map((c) => c.id)
    expect(ids).toContain(offspring1)
    expect(ids).not.toContain(unrelated)
  })
})

describe('PUT /api/cows/:id — species_id sync on breed_type change', () => {
  it('updates species_id when breed_type_id changes', async () => {
    const cattle = await db('species').where({ code: 'cattle' }).first()
    const sheep = await db('species').where({ code: 'sheep' }).first()
    const now = new Date().toISOString()

    const sheepBtId = randomUUID()
    await db('breed_types').insert({
      id: sheepBtId,
      farm_id: DEFAULT_FARM_ID,
      code: `sheep_bt_${sheepBtId.slice(0, 6)}`,
      name: `SheepBt-${sheepBtId.slice(0, 6)}`,
      species_id: sheep.id,
      is_active: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    })

    const cowId = await createCow({
      tag_number: `CHNGSP-${randomUUID().slice(0, 6)}`,
      species_id: cattle.id,
    })

    const res = await request(app)
      .put(`/api/cows/${cowId}`)
      .set('Authorization', adminToken())
      .send({ name: 'Updated', breed_type_id: sheepBtId })

    expect(res.status).toBe(200)
    const row = await db('cows').where({ id: cowId }).first()
    expect(row.species_id).toBe(sheep.id)
  })
})

// ─── Query Validation (12B.4) ───────────────────────────────────────────────

describe('GET /api/cows query validation', () => {
  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .get('/api/cows?status=invalid')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })

  it('returns 400 for unknown query param', async () => {
    const res = await request(app).get('/api/cows?nonexistent=1').set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })
})
