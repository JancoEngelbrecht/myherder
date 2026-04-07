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

// Helper — inserts an animal row and returns its id
async function createAnimal(overrides = {}) {
  const id = randomUUID()
  await db('animals').insert({
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

// ─── GET /api/animals ─────────────────────────────────────────────────────────

describe('GET /api/animals', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/animals')
    expect(res.status).toBe(401)
  })

  it('returns a plain array of animals', async () => {
    const res = await request(app).get('/api/animals').set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('filters by search query (tag and name)', async () => {
    const tag = `SRCH-${randomUUID().slice(0, 6)}`
    await createAnimal({ tag_number: tag, name: 'Searchable' })

    const res = await request(app)
      .get(`/api/animals?search=${tag}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.some((c) => c.tag_number === tag)).toBe(true)
  })

  it('filters by status', async () => {
    await createAnimal({ tag_number: `SICK-${randomUUID().slice(0, 6)}`, status: 'sick' })

    const res = await request(app)
      .get('/api/animals?status=sick')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.every((c) => c.status === 'sick')).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('respects pagination (limit + page)', async () => {
    // Insert enough animals so there is more than 1 page worth
    for (let i = 0; i < 3; i++) {
      await createAnimal({ tag_number: `PAGE-${randomUUID().slice(0, 6)}` })
    }

    const res = await request(app)
      .get('/api/animals?limit=2&page=1')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(2)
  })
})

// ─── GET /api/animals/:id ─────────────────────────────────────────────────────

describe('GET /api/animals/:id', () => {
  it('returns a single animal with sire_name and dam_name', async () => {
    const sireId = await createAnimal({
      tag_number: `SIRE-${randomUUID().slice(0, 6)}`,
      sex: 'male',
      name: 'Big Bull',
    })
    const animalId = await createAnimal({
      tag_number: `CALF-${randomUUID().slice(0, 6)}`,
      sire_id: sireId,
    })

    const res = await request(app)
      .get(`/api/animals/${animalId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(animalId)
    expect(res.body.sire_name).toBe('Big Bull')
    expect(res.body.dam_name).toBeNull()
  })

  it('returns 404 for a nonexistent animal', async () => {
    const res = await request(app)
      .get(`/api/animals/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })
})

// ─── POST /api/animals ────────────────────────────────────────────────────────

describe('POST /api/animals', () => {
  it('creates an animal and returns 201', async () => {
    const tag = `NEW-${randomUUID().slice(0, 6)}`
    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: tag, name: 'Bessie', sex: 'female', status: 'active' })

    expect(res.status).toBe(201)
    expect(res.body.tag_number).toBe(tag)
    expect(res.body.id).toBeDefined()
  })

  it('returns 409 when tag_number is a duplicate', async () => {
    const tag = `DUP-${randomUUID().slice(0, 6)}`
    await createAnimal({ tag_number: tag })

    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: tag })

    expect(res.status).toBe(409)
  })

  it('returns 400 for missing tag_number', async () => {
    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ name: 'No Tag' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: `BAD-${randomUUID().slice(0, 6)}`, status: 'unicorn' })

    expect(res.status).toBe(400)
  })

  it('returns 403 for a worker without can_manage_animals permission', async () => {
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
      .post('/api/animals')
      .set('Authorization', noPermToken)
      .send({ tag_number: `DENY-${randomUUID().slice(0, 6)}` })

    expect(res.status).toBe(403)
  })
})

// ─── PUT /api/animals/:id ─────────────────────────────────────────────────────

describe('PUT /api/animals/:id', () => {
  it('updates the animal and returns 200', async () => {
    const id = await createAnimal({
      tag_number: `UPD-${randomUUID().slice(0, 6)}`,
      name: 'Old Name',
    })

    const res = await request(app)
      .put(`/api/animals/${id}`)
      .set('Authorization', adminToken())
      .send({ name: 'New Name', status: 'dry' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New Name')
    expect(res.body.status).toBe('dry')
  })

  it('returns 404 for a nonexistent animal', async () => {
    const res = await request(app)
      .put(`/api/animals/${randomUUID()}`)
      .set('Authorization', adminToken())
      .send({ name: 'Ghost' })

    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/animals/:id ──────────────────────────────────────────────────

describe('DELETE /api/animals/:id', () => {
  it('soft-deletes the animal (admin)', async () => {
    const id = await createAnimal({ tag_number: `DEL-${randomUUID().slice(0, 6)}` })

    const res = await request(app).delete(`/api/animals/${id}`).set('Authorization', adminToken())

    expect(res.status).toBe(200)

    // Should no longer appear in listings
    const listRes = await request(app).get('/api/animals').set('Authorization', adminToken())
    expect(listRes.body.find((c) => c.id === id)).toBeUndefined()
  })

  it('returns 403 for a worker token', async () => {
    const id = await createAnimal({ tag_number: `WDEL-${randomUUID().slice(0, 6)}` })

    const res = await request(app).delete(`/api/animals/${id}`).set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })
})

// ─── Species-aware animal tests ───────────────────────────────────────────────

describe('POST /api/animals — species_id auto-set from breed_type', () => {
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
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: tag, sex: 'female', breed_type_id: btId })

    expect(res.status).toBe(201)
    const row = await db('animals').where({ id: res.body.id }).first()
    expect(row.species_id).toBe(cattle.id)
  })

  it('accepts birth_event_id linking an offspring to a birth event', async () => {
    const animalId = await createAnimal({ tag_number: `DAM-${randomUUID().slice(0, 6)}` })
    const birthEventId = randomUUID()
    const now = new Date().toISOString()
    await db('breeding_events').insert({
      id: birthEventId,
      farm_id: DEFAULT_FARM_ID,
      animal_id: animalId,
      event_type: 'calving',
      event_date: '2026-01-15T08:00',
      offspring_count: 1,
      recorded_by: (await db('users').where('farm_id', DEFAULT_FARM_ID).first()).id,
      created_at: now,
      updated_at: now,
    })

    const tag = `OFFSPRING-${randomUUID().slice(0, 6)}`
    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: tag, sex: 'female', birth_event_id: birthEventId })

    expect(res.status).toBe(201)
    const row = await db('animals').where({ id: res.body.id }).first()
    expect(row.birth_event_id).toBe(birthEventId)
  })
})

describe('GET /api/animals — species filter', () => {
  it('filters animals by species_id', async () => {
    const cattle = await db('species').where({ code: 'cattle' }).first()
    const sheep = await db('species').where({ code: 'sheep' }).first()

    const cattleAnimalId = await createAnimal({
      tag_number: `CATTLESP-${randomUUID().slice(0, 6)}`,
      species_id: cattle.id,
    })
    const sheepAnimalId = await createAnimal({
      tag_number: `SHEEPSP-${randomUUID().slice(0, 6)}`,
      species_id: sheep.id,
    })

    const res = await request(app)
      .get(`/api/animals?species_id=${cattle.id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const ids = res.body.map((c) => c.id)
    expect(ids).toContain(cattleAnimalId)
    expect(ids).not.toContain(sheepAnimalId)
  })

  it('filters offspring by birth_event_id', async () => {
    const damId = await createAnimal({ tag_number: `DAM2-${randomUUID().slice(0, 6)}` })
    const evId = randomUUID()
    const now = new Date().toISOString()
    await db('breeding_events').insert({
      id: evId,
      farm_id: DEFAULT_FARM_ID,
      animal_id: damId,
      event_type: 'calving',
      event_date: '2026-02-01T08:00',
      offspring_count: 2,
      recorded_by: (await db('users').where('farm_id', DEFAULT_FARM_ID).first()).id,
      created_at: now,
      updated_at: now,
    })

    const offspring1 = await createAnimal({
      tag_number: `OFF1-${randomUUID().slice(0, 6)}`,
      birth_event_id: evId,
    })
    const unrelated = await createAnimal({
      tag_number: `UNREL-${randomUUID().slice(0, 6)}`,
    })

    const res = await request(app)
      .get(`/api/animals?birth_event_id=${evId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const ids = res.body.map((c) => c.id)
    expect(ids).toContain(offspring1)
    expect(ids).not.toContain(unrelated)
  })
})

describe('PUT /api/animals/:id — species_id sync on breed_type change', () => {
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

    const animalId = await createAnimal({
      tag_number: `CHNGSP-${randomUUID().slice(0, 6)}`,
      species_id: cattle.id,
    })

    const res = await request(app)
      .put(`/api/animals/${animalId}`)
      .set('Authorization', adminToken())
      .send({ name: 'Updated', breed_type_id: sheepBtId })

    expect(res.status).toBe(200)
    const row = await db('animals').where({ id: animalId }).first()
    expect(row.species_id).toBe(sheep.id)
  })
})

// ─── Query Validation (12B.4) ─────────────────────────────────────────────────

describe('GET /api/animals query validation', () => {
  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .get('/api/animals?status=invalid')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })

  it('returns 400 for unknown query param', async () => {
    const res = await request(app)
      .get('/api/animals?nonexistent=1')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })
})
