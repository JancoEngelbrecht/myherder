const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { ADMIN_ID, WORKER_ID, DEFAULT_FARM_ID, seedUsers } = require('./helpers/setup')
const { adminToken, workerTokenWith } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ── Factory ───────────────────────────────────────────────────────────────────

async function createAnimal(overrides = {}) {
  const id = randomUUID()
  await db('animals').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    tag_number: `M-${id.slice(0, 8)}`,
    name: `Cow ${id.slice(0, 4)}`,
    sex: 'female',
    status: 'active',
    ...overrides,
  })
  return id
}

async function createRecord(animalId, overrides = {}) {
  const id = randomUUID()
  await db('milk_records').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    animal_id: animalId,
    recorded_by: ADMIN_ID,
    session: 'morning',
    litres: 10.5,
    recording_date: '2026-02-15',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  })
  return id
}

// ── GET /api/milk-records (legacy — plain array) ────────────────────────────

describe('GET /api/milk-records (legacy)', () => {
  let animalId

  beforeAll(async () => {
    animalId = await createAnimal({ tag_number: 'LEG-001', name: 'Legacy' })
    await createRecord(animalId, { recording_date: '2026-01-10', session: 'morning' })
    await createRecord(animalId, { recording_date: '2026-01-10', session: 'afternoon' })
  })

  it('returns plain array when no page/limit params', async () => {
    const res = await request(app)
      .get('/api/milk-records?date=2026-01-10')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(2)
  })

  it('filters by date', async () => {
    const res = await request(app)
      .get('/api/milk-records?date=2026-01-10')
      .set('Authorization', adminToken())

    for (const r of res.body) {
      expect(r.recording_date).toBe('2026-01-10')
    }
  })

  it('filters by session', async () => {
    const res = await request(app)
      .get('/api/milk-records?date=2026-01-10&session=morning')
      .set('Authorization', adminToken())

    for (const r of res.body) {
      expect(r.session).toBe('morning')
    }
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/milk-records')
    expect(res.status).toBe(401)
  })
})

// ── GET /api/milk-records (paginated) ───────────────────────────────────────

describe('GET /api/milk-records (paginated)', () => {
  let animalA, animalB

  beforeAll(async () => {
    animalA = await createAnimal({ tag_number: 'PG-001', name: 'Alpha' })
    animalB = await createAnimal({ tag_number: 'PG-002', name: 'Beta' })

    // Create records across multiple dates
    for (let day = 1; day <= 5; day++) {
      const d = `2026-03-${String(day).padStart(2, '0')}`
      await createRecord(animalA, { recording_date: d, session: 'morning', litres: day * 2 })
      await createRecord(animalB, { recording_date: d, session: 'morning', litres: day * 3 })
    }
    // Extra afternoon records for animalA
    await createRecord(animalA, {
      recording_date: '2026-03-01',
      session: 'afternoon',
      litres: 5,
      recorded_by: WORKER_ID,
    })
    await createRecord(animalA, { recording_date: '2026-03-02', session: 'afternoon', litres: 7 })
  })

  it('returns paginated response with data + total', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=3')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('data')
    expect(res.body).toHaveProperty('total')
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeLessThanOrEqual(3)
    expect(res.body.total).toBeGreaterThanOrEqual(12) // at least our 12 records
  })

  it('paginates correctly (page 2 has different records than page 1)', async () => {
    const p1 = await request(app)
      .get('/api/milk-records?page=1&limit=5')
      .set('Authorization', adminToken())
    const p2 = await request(app)
      .get('/api/milk-records?page=2&limit=5')
      .set('Authorization', adminToken())

    const p1Ids = p1.body.data.map((r) => r.id)
    const p2Ids = p2.body.data.map((r) => r.id)
    // No overlap between pages
    for (const id of p2Ids) {
      expect(p1Ids).not.toContain(id)
    }
  })

  it('filters by from/to date range', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=50&from=2026-03-02&to=2026-03-04')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    for (const r of res.body.data) {
      expect(r.recording_date >= '2026-03-02').toBe(true)
      expect(r.recording_date <= '2026-03-04').toBe(true)
    }
    // Should have records from days 2, 3, 4 only
    expect(res.body.total).toBeGreaterThanOrEqual(6)
  })

  it('filters by recorded_by', async () => {
    const res = await request(app)
      .get(`/api/milk-records?page=1&limit=50&recorded_by=${WORKER_ID}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(1)
    for (const r of res.body.data) {
      expect(r.recorded_by).toBe(WORKER_ID)
    }
  })

  it('sorts by litres desc', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=50&sort=litres&order=desc')
      .set('Authorization', adminToken())

    const litres = res.body.data.map((r) => Number(r.litres))
    for (let i = 1; i < litres.length; i++) {
      expect(litres[i - 1]).toBeGreaterThanOrEqual(litres[i])
    }
  })

  it('sorts by litres asc', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=50&sort=litres&order=asc')
      .set('Authorization', adminToken())

    const litres = res.body.data.map((r) => Number(r.litres))
    for (let i = 1; i < litres.length; i++) {
      expect(litres[i - 1]).toBeLessThanOrEqual(litres[i])
    }
  })

  it('sorts by tag_number asc', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=50&sort=tag_number&order=asc')
      .set('Authorization', adminToken())

    const tags = res.body.data.map((r) => r.tag_number)
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i - 1] <= tags[i]).toBe(true)
    }
  })

  it('returns empty data array with total 0 when no matches', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=10&from=2099-01-01&to=2099-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.total).toBe(0)
  })

  it('defaults to page=1 limit=25 when only limit is given', async () => {
    const res = await request(app)
      .get('/api/milk-records?limit=2')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeLessThanOrEqual(2)
    expect(res.body.total).toBeGreaterThan(2)
  })

  it('includes joined fields (tag_number, animal_name, recorded_by_name)', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=1')
      .set('Authorization', adminToken())

    const rec = res.body.data[0]
    expect(rec).toHaveProperty('tag_number')
    expect(rec).toHaveProperty('animal_name')
    expect(rec).toHaveProperty('recorded_by_name')
  })

  it('returns 400 for invalid sort field', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&sort=invalid')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid order', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&order=sideways')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })

  it('filters by search on cow tag_number', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=50&search=PG-001')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(1)
    for (const r of res.body.data) {
      expect(r.tag_number).toBe('PG-001')
    }
  })

  it('filters by search on cow name', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=50&search=Alpha')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(1)
    for (const r of res.body.data) {
      expect(r.animal_name).toBe('Alpha')
    }
  })

  it('filters by search on recorded_by_name', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=50&search=Admin')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(1)
  })

  it('filters by discarded=true', async () => {
    // Create a discarded record
    const discardAnimal = await createAnimal({ tag_number: 'DISC-001', name: 'Discard' })
    await createRecord(discardAnimal, {
      recording_date: '2026-03-10',
      session: 'morning',
      milk_discarded: true,
      discard_reason: 'withdrawal',
    })

    const res = await request(app)
      .get('/api/milk-records?page=1&limit=50&discarded=true')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    for (const r of res.body.data) {
      expect(r.milk_discarded).toBeTruthy()
    }
  })

  it('filters by discarded=false excludes discarded records', async () => {
    const res = await request(app)
      .get('/api/milk-records?page=1&limit=50&discarded=false')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    for (const r of res.body.data) {
      expect(Number(r.milk_discarded)).toBe(0)
    }
  })
})

// ── GET /api/milk-records/recorders ──────────────────────────────────────────

describe('GET /api/milk-records/recorders', () => {
  it('returns distinct recorders', async () => {
    const res = await request(app)
      .get('/api/milk-records/recorders')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    expect(res.body[0]).toHaveProperty('id')
    expect(res.body[0]).toHaveProperty('full_name')
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/milk-records/recorders')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/milk-records permission enforcement', () => {
  it('returns 403 for worker without can_record_milk', async () => {
    const token = workerTokenWith([])
    const res = await request(app).get('/api/milk-records').set('Authorization', token)
    expect(res.status).toBe(403)
  })

  it('returns 403 for GET /recorders without can_record_milk', async () => {
    const token = workerTokenWith([])
    const res = await request(app).get('/api/milk-records/recorders').set('Authorization', token)
    expect(res.status).toBe(403)
  })

  it('returns 403 for GET /summary without can_record_milk', async () => {
    const token = workerTokenWith([])
    const res = await request(app)
      .get('/api/milk-records/summary?date=2025-01-01')
      .set('Authorization', token)
    expect(res.status).toBe(403)
  })
})
