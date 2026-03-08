const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../../app')
const db = require('../../config/database')
const { DEFAULT_FARM_ID, seedUsers } = require('../helpers/setup')
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
    farm_id: DEFAULT_FARM_ID,
    tag_number: `A-${id.slice(0, 8)}`,
    sex: 'female',
    status: 'active',
    ...overrides,
  })
  return id
}

// ─── GET /api/analytics/age-distribution ─────────────────────────────────────

describe('GET /api/analytics/age-distribution', () => {
  it('returns brackets array, total, males, and females', async () => {
    const res = await request(app)
      .get('/api/analytics/age-distribution')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('brackets')
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('males')
    expect(res.body).toHaveProperty('females')
    expect(Array.isArray(res.body.brackets)).toBe(true)
    expect(res.body.brackets.length).toBe(6) // 5 age brackets + Unknown
  })

  it('excludes deleted cows', async () => {
    await createCow({ deleted_at: new Date().toISOString() })
    const beforeRes = await request(app)
      .get('/api/analytics/age-distribution')
      .set('Authorization', adminToken())

    // Create a non-deleted cow and verify count increases
    await createCow({ dob: '2024-01-01' })
    const afterRes = await request(app)
      .get('/api/analytics/age-distribution')
      .set('Authorization', adminToken())

    expect(afterRes.body.total).toBeGreaterThan(beforeRes.body.total)
  })

  it('puts cows with null dob in Unknown bracket', async () => {
    await createCow({ dob: null })

    const res = await request(app)
      .get('/api/analytics/age-distribution')
      .set('Authorization', adminToken())

    const unknown = res.body.brackets.find(b => b.label === 'Unknown')
    expect(unknown).toBeDefined()
    expect(unknown.count).toBeGreaterThanOrEqual(1)
  })

  it('includes males and females per bracket', async () => {
    await createCow({ sex: 'male', dob: '2024-01-01' })
    await createCow({ sex: 'female', dob: '2024-01-01' })

    const res = await request(app)
      .get('/api/analytics/age-distribution')
      .set('Authorization', adminToken())

    for (const bracket of res.body.brackets) {
      expect(typeof bracket.males).toBe('number')
      expect(typeof bracket.females).toBe('number')
      expect(bracket.males + bracket.females).toBe(bracket.count)
    }
  })
})

// ─── GET /api/analytics/breed-composition ────────────────────────────────────

describe('GET /api/analytics/breed-composition', () => {
  it('returns breeds array and total', async () => {
    const res = await request(app)
      .get('/api/analytics/breed-composition')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('breeds')
    expect(res.body).toHaveProperty('total')
    expect(Array.isArray(res.body.breeds)).toBe(true)
  })

  it('groups cows without breed as Unassigned', async () => {
    await createCow({ breed_type_id: null })

    const res = await request(app)
      .get('/api/analytics/breed-composition')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const unassigned = res.body.breeds.find(b => b.name === 'Unassigned')
    expect(unassigned).toBeDefined()
    expect(unassigned.count).toBeGreaterThanOrEqual(1)
    expect(unassigned.code).toBeNull()
  })
})

// ─── GET /api/analytics/mortality-rate ───────────────────────────────────────

describe('GET /api/analytics/mortality-rate', () => {
  it('returns months array, total_lost, and avg_rate_pct', async () => {
    const res = await request(app)
      .get('/api/analytics/mortality-rate')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(res.body).toHaveProperty('total_lost')
    expect(res.body).toHaveProperty('avg_rate_pct')
    expect(Array.isArray(res.body.months)).toBe(true)
    expect(typeof res.body.total_lost).toBe('number')
    expect(typeof res.body.avg_rate_pct).toBe('number')
  })

  it('returns empty months for empty date range', async () => {
    const res = await request(app)
      .get('/api/analytics/mortality-rate?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.months).toEqual([])
    expect(res.body.total_lost).toBe(0)
    expect(res.body.avg_rate_pct).toBe(0)
  })
})

// ─── GET /api/analytics/herd-size-trend ──────────────────────────────────────

describe('GET /api/analytics/herd-size-trend', () => {
  it('returns months array with total per month', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-size-trend')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(Array.isArray(res.body.months)).toBe(true)

    if (res.body.months.length > 0) {
      const m = res.body.months[0]
      expect(m).toHaveProperty('month')
      expect(m).toHaveProperty('total')
      expect(m.month).toMatch(/^\d{4}-\d{2}$/)
      expect(typeof m.total).toBe('number')
    }
  })

  it('respects date range filter', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-size-trend?from=2025-01-01&to=2025-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // Should have 12 months in the range
    expect(res.body.months.length).toBe(12)
    for (const m of res.body.months) {
      expect(m.month).toMatch(/^2025-/)
    }
  })

  it('shows cumulative totals (non-decreasing)', async () => {
    // Create some cows to ensure data exists
    await createCow()
    await createCow()

    const res = await request(app)
      .get('/api/analytics/herd-size-trend')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    for (let i = 1; i < res.body.months.length; i++) {
      expect(res.body.months[i].total).toBeGreaterThanOrEqual(res.body.months[i - 1].total)
    }
  })
})

// ─── GET /api/analytics/herd-turnover ────────────────────────────────────────

describe('GET /api/analytics/herd-turnover', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/herd-turnover')
    expect(res.status).toBe(401)
  })

  it('returns months with additions, removals, net and totals', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-turnover')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(res.body).toHaveProperty('total_additions')
    expect(res.body).toHaveProperty('total_removals')
    expect(Array.isArray(res.body.months)).toBe(true)
    expect(typeof res.body.total_additions).toBe('number')
    expect(typeof res.body.total_removals).toBe('number')

    if (res.body.months.length > 0) {
      const m = res.body.months[0]
      expect(m).toHaveProperty('month')
      expect(m).toHaveProperty('additions')
      expect(m).toHaveProperty('removals')
      expect(m).toHaveProperty('net')
      expect(m.net).toBe(m.additions - m.removals)
    }
  })

  it('respects date range filter', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-turnover?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.months).toEqual([])
    expect(res.body.total_additions).toBe(0)
    expect(res.body.total_removals).toBe(0)
  })

  it('counts sold/dead cows as removals', async () => {
    const now = new Date()
    const from = `${now.getFullYear()}-01-01`
    const to = `${now.getFullYear()}-12-31`

    await createCow({ status: 'sold', updated_at: now.toISOString() })

    const res = await request(app)
      .get(`/api/analytics/herd-turnover?from=${from}&to=${to}`)
      .set('Authorization', adminToken())

    expect(res.body.total_removals).toBeGreaterThanOrEqual(1)
  })
})
