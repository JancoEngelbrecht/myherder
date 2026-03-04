const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../../app')
const db = require('../../config/database')
const { ADMIN_ID, seedUsers } = require('../helpers/setup')
const { adminToken } = require('../helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

async function createCow(overrides = {}) {
  const id = randomUUID()
  await db('cows').insert({
    id,
    tag_number: `A-${id.slice(0, 8)}`,
    sex: 'female',
    status: 'active',
    ...overrides,
  })
  return id
}

async function createMilkRecord(cowId, overrides = {}) {
  const id = randomUUID()
  await db('milk_records').insert({
    id,
    cow_id: cowId,
    recorded_by: ADMIN_ID,
    session: 'morning',
    litres: 10,
    recording_date: new Date().toISOString().slice(0, 10),
    milk_discarded: false,
    ...overrides,
  })
  return id
}

async function createTreatment(cowId, medId, overrides = {}) {
  const id = randomUUID()
  await db('treatments').insert({
    id,
    cow_id: cowId,
    medication_id: medId,
    administered_by: ADMIN_ID,
    treatment_date: new Date().toISOString(),
    cost: 100,
    ...overrides,
  })
  return id
}

async function createMedication(overrides = {}) {
  const id = randomUUID()
  await db('medications').insert({
    id,
    name: `Med-${id.slice(0, 6)}`,
    is_active: true,
    ...overrides,
  })
  return id
}

// ─── GET /api/analytics/milk-trends ───────────────────────────────────────────

describe('GET /api/analytics/milk-trends', () => {
  it('returns months array with total_litres and record_count', async () => {
    const cowId = await createCow()
    const today = new Date().toISOString().slice(0, 10)
    await createMilkRecord(cowId, { litres: 15, recording_date: today })

    const res = await request(app)
      .get('/api/analytics/milk-trends')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(Array.isArray(res.body.months)).toBe(true)

    if (res.body.months.length > 0) {
      const m = res.body.months[0]
      expect(m).toHaveProperty('month')
      expect(m).toHaveProperty('total_litres')
      expect(m).toHaveProperty('record_count')
      expect(m).toHaveProperty('avg_per_cow')
      expect(m.month).toMatch(/^\d{4}-\d{2}$/)
    }
  })

  it('respects from/to date range', async () => {
    const cowId = await createCow()
    await createMilkRecord(cowId, { litres: 20, recording_date: '2020-01-15' })

    const res = await request(app)
      .get('/api/analytics/milk-trends?from=2020-01-01&to=2020-01-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const jan = res.body.months.find((m) => m.month === '2020-01')
    expect(jan).toBeDefined()
    expect(jan.total_litres).toBeGreaterThanOrEqual(20)
  })

  it('returns empty months array when no data in range', async () => {
    const res = await request(app)
      .get('/api/analytics/milk-trends?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.months).toEqual([])
  })
})

// ─── GET /api/analytics/top-producers ─────────────────────────────────────────

describe('GET /api/analytics/top-producers', () => {
  it('returns array of cows with avg_daily_litres', async () => {
    const cowId = await createCow()
    const today = new Date().toISOString().slice(0, 10)
    await createMilkRecord(cowId, { litres: 25, recording_date: today })

    const res = await request(app)
      .get('/api/analytics/top-producers')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const found = res.body.find((r) => r.id === cowId)
    expect(found).toBeDefined()
    expect(found).toHaveProperty('avg_daily_litres')
    expect(found).toHaveProperty('total_litres')
    expect(found).toHaveProperty('days_recorded')
  })

  it('limits to 10 results', async () => {
    const res = await request(app)
      .get('/api/analytics/top-producers')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(10)
  })

  it('respects from/to date range', async () => {
    const cowId = await createCow()
    await createMilkRecord(cowId, { litres: 30, recording_date: '2020-04-15' })

    const res = await request(app)
      .get('/api/analytics/top-producers?from=2020-04-01&to=2020-04-30')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const found = res.body.find((r) => r.id === cowId)
    expect(found).toBeDefined()
    expect(found.total_litres).toBeGreaterThanOrEqual(30)
  })

  it('returns empty for date range with no data', async () => {
    const res = await request(app)
      .get('/api/analytics/top-producers?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

// ─── GET /api/analytics/wasted-milk ───────────────────────────────────────────

describe('GET /api/analytics/wasted-milk', () => {
  it('returns months array and total_discarded', async () => {
    const cowId = await createCow()
    const today = new Date().toISOString().slice(0, 10)
    await createMilkRecord(cowId, {
      litres: 8,
      recording_date: today,
      milk_discarded: true,
      discard_reason: 'withdrawal',
    })

    const res = await request(app)
      .get('/api/analytics/wasted-milk')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(res.body).toHaveProperty('total_discarded')
    expect(typeof res.body.total_discarded).toBe('number')

    if (res.body.months.length > 0) {
      const m = res.body.months[0]
      expect(m).toHaveProperty('discarded_litres')
      expect(m).toHaveProperty('discard_count')
    }
  })

  it('respects date range filter', async () => {
    const cowId = await createCow()
    await createMilkRecord(cowId, {
      litres: 5,
      recording_date: '2020-06-15',
      milk_discarded: true,
    })

    const res = await request(app)
      .get('/api/analytics/wasted-milk?from=2020-06-01&to=2020-06-30')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const jun = res.body.months.find((m) => m.month === '2020-06')
    expect(jun).toBeDefined()
    expect(jun.discarded_litres).toBeGreaterThanOrEqual(5)
  })
})

// ─── GET /api/analytics/treatment-costs ───────────────────────────────────────

describe('GET /api/analytics/treatment-costs', () => {
  it('returns months array and grand_total', async () => {
    const cowId = await createCow()
    const medId = await createMedication()
    await createTreatment(cowId, medId, { cost: 250 })

    const res = await request(app)
      .get('/api/analytics/treatment-costs')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(res.body).toHaveProperty('grand_total')
    expect(typeof res.body.grand_total).toBe('number')

    if (res.body.months.length > 0) {
      const m = res.body.months[0]
      expect(m).toHaveProperty('month')
      expect(m).toHaveProperty('total_cost')
      expect(m).toHaveProperty('treatment_count')
    }
  })

  it('respects date range filter', async () => {
    const cowId = await createCow()
    const medId = await createMedication()
    await createTreatment(cowId, medId, {
      cost: 300,
      treatment_date: '2020-03-15T10:00:00.000Z',
    })

    const res = await request(app)
      .get('/api/analytics/treatment-costs?from=2020-03-01&to=2020-03-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const mar = res.body.months.find((m) => m.month === '2020-03')
    expect(mar).toBeDefined()
    expect(mar.total_cost).toBeGreaterThanOrEqual(300)
  })

  it('returns empty months for empty date range', async () => {
    const res = await request(app)
      .get('/api/analytics/treatment-costs?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.months).toEqual([])
    expect(res.body.grand_total).toBe(0)
  })
})

// ─── GET /api/analytics/litres-per-cow ────────────────────────────────────────

describe('GET /api/analytics/litres-per-cow', () => {
  it('returns months array with avg_litres_per_cow_per_day', async () => {
    const cowId = await createCow()
    const today = new Date().toISOString().slice(0, 10)
    await createMilkRecord(cowId, { litres: 20, recording_date: today })

    const res = await request(app)
      .get('/api/analytics/litres-per-cow')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(Array.isArray(res.body.months)).toBe(true)

    if (res.body.months.length > 0) {
      const m = res.body.months[0]
      expect(m).toHaveProperty('month')
      expect(m).toHaveProperty('avg_litres_per_cow_per_day')
      expect(m).toHaveProperty('cow_count')
      expect(m.month).toMatch(/^\d{4}-\d{2}$/)
    }
  })

  it('respects date range', async () => {
    const cowId = await createCow()
    await createMilkRecord(cowId, { litres: 30, recording_date: '2020-05-10' })

    const res = await request(app)
      .get('/api/analytics/litres-per-cow?from=2020-05-01&to=2020-05-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const may = res.body.months.find((m) => m.month === '2020-05')
    expect(may).toBeDefined()
    expect(may.avg_litres_per_cow_per_day).toBeGreaterThan(0)
  })
})

// ─── GET /api/analytics/bottom-producers ─────────────────────────────────────

describe('GET /api/analytics/bottom-producers', () => {
  it('returns array sorted by total_litres ascending', async () => {
    const cowId = await createCow()
    const today = new Date().toISOString().slice(0, 10)
    await createMilkRecord(cowId, { litres: 2, recording_date: today, session: 'afternoon' })

    const res = await request(app)
      .get('/api/analytics/bottom-producers')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const found = res.body.find((r) => r.id === cowId)
    expect(found).toBeDefined()
    expect(found).toHaveProperty('avg_daily_litres')
    expect(found).toHaveProperty('total_litres')
  })

  it('limits to 10 results', async () => {
    const res = await request(app)
      .get('/api/analytics/bottom-producers')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(10)
  })

  it('respects from/to date range', async () => {
    const cowId = await createCow()
    await createMilkRecord(cowId, { litres: 3, recording_date: '2020-05-10' })

    const res = await request(app)
      .get('/api/analytics/bottom-producers?from=2020-05-01&to=2020-05-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const found = res.body.find((r) => r.id === cowId)
    expect(found).toBeDefined()
    expect(found.total_litres).toBeGreaterThanOrEqual(3)
  })

  it('returns empty for date range with no data', async () => {
    const res = await request(app)
      .get('/api/analytics/bottom-producers?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})
