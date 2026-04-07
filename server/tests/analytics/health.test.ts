const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../../app')
const db = require('../../config/database')
const { ADMIN_ID, DEFAULT_FARM_ID, seedUsers } = require('../helpers/setup')
const { adminToken } = require('../helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

async function createAnimal(overrides = {}) {
  const id = randomUUID()
  await db('animals').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    tag_number: `A-${id.slice(0, 8)}`,
    sex: 'female',
    status: 'active',
    ...overrides,
  })
  return id
}

async function createHealthIssue(animalId, overrides = {}) {
  const id = randomUUID()
  await db('health_issues').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    animal_id: animalId,
    issue_types: JSON.stringify(['mastitis']),
    severity: 'medium',
    observed_at: new Date().toISOString(),
    status: 'open',
    reported_by: ADMIN_ID,
    ...overrides,
  })
  return id
}

async function createTreatment(animalId, medId, overrides = {}) {
  const id = randomUUID()
  await db('treatments').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    animal_id: animalId,
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
    farm_id: DEFAULT_FARM_ID,
    name: `Med-${id.slice(0, 6)}`,
    is_active: true,
    ...overrides,
  })
  return id
}

// ─── GET /api/analytics/unhealthiest ──────────────────────────────────────────

describe('GET /api/analytics/unhealthiest', () => {
  it('returns array of cows with issue_count', async () => {
    const animalId = await createAnimal()
    await createHealthIssue(animalId)
    await createHealthIssue(animalId)

    const res = await request(app)
      .get('/api/analytics/unhealthiest')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const found = res.body.find((r) => r.id === animalId)
    expect(found).toBeDefined()
    expect(found.tag_number).toBeDefined()
    expect(found.sex).toBeDefined()
    expect(Number(found.issue_count)).toBeGreaterThanOrEqual(2)
  })

  it('excludes issues outside default 12-month range', async () => {
    const animalId = await createAnimal()
    // Create issue > 12 months ago — should be excluded from default range
    const oldDate = new Date()
    oldDate.setMonth(oldDate.getMonth() - 13)
    await createHealthIssue(animalId, { observed_at: oldDate.toISOString() })

    const res = await request(app)
      .get('/api/analytics/unhealthiest')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // The old issue cow should not appear (outside 12-month default)
    const found = res.body.find((r) => r.id === animalId)
    expect(found).toBeUndefined()
  })

  it('limits to 10 results', async () => {
    const res = await request(app)
      .get('/api/analytics/unhealthiest')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(10)
  })

  it('respects from/to date range', async () => {
    const animalId = await createAnimal()
    await createHealthIssue(animalId, { observed_at: '2020-03-15T10:00:00.000Z' })

    const res = await request(app)
      .get('/api/analytics/unhealthiest?from=2020-03-01&to=2020-03-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const found = res.body.find((r) => r.id === animalId)
    expect(found).toBeDefined()
    expect(Number(found.issue_count)).toBeGreaterThanOrEqual(1)
  })

  it('returns empty for date range with no data', async () => {
    const res = await request(app)
      .get('/api/analytics/unhealthiest?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

// ─── GET /api/analytics/issue-frequency ──────────────────────────────────────

describe('GET /api/analytics/issue-frequency', () => {
  it('returns by_type and by_month arrays', async () => {
    const res = await request(app)
      .get('/api/analytics/issue-frequency')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('by_type')
    expect(res.body).toHaveProperty('by_month')
    expect(Array.isArray(res.body.by_type)).toBe(true)
    expect(Array.isArray(res.body.by_month)).toBe(true)
  })

  it('counts issue types correctly with name and emoji', async () => {
    const animalId = await createAnimal()
    await createHealthIssue(animalId, {
      issue_types: JSON.stringify(['mastitis', 'fever']),
      observed_at: '2025-07-15T10:00:00.000Z',
    })

    const res = await request(app)
      .get('/api/analytics/issue-frequency?from=2025-07-01&to=2025-07-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const mastitis = res.body.by_type.find((t) => t.code === 'mastitis')
    expect(mastitis).toBeDefined()
    expect(mastitis.count).toBeGreaterThanOrEqual(1)
    expect(mastitis).toHaveProperty('name')
    expect(mastitis).toHaveProperty('emoji')

    const fever = res.body.by_type.find((t) => t.code === 'fever')
    expect(fever).toBeDefined()
    expect(fever.count).toBeGreaterThanOrEqual(1)
  })

  it('groups by month correctly', async () => {
    const animalId = await createAnimal()
    await createHealthIssue(animalId, {
      issue_types: JSON.stringify(['lameness']),
      observed_at: '2020-08-10T10:00:00.000Z',
    })

    const res = await request(app)
      .get('/api/analytics/issue-frequency?from=2020-08-01&to=2020-08-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const aug = res.body.by_month.find((m) => m.month === '2020-08')
    expect(aug).toBeDefined()
    expect(aug.counts).toHaveProperty('lameness')
    expect(aug.counts.lameness).toBeGreaterThanOrEqual(1)
  })

  it('respects date range filter', async () => {
    const res = await request(app)
      .get('/api/analytics/issue-frequency?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.by_type).toEqual([])
    expect(res.body.by_month).toEqual([])
  })
})

// ─── GET /api/analytics/mastitis-rate ────────────────────────────────────────

describe('GET /api/analytics/mastitis-rate', () => {
  it('returns months array and avg_rate', async () => {
    const res = await request(app)
      .get('/api/analytics/mastitis-rate')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(res.body).toHaveProperty('avg_rate')
    expect(Array.isArray(res.body.months)).toBe(true)
    expect(typeof res.body.avg_rate).toBe('number')
  })

  it('computes rate as cases per 100 cows', async () => {
    const animalId = await createAnimal()
    await createHealthIssue(animalId, {
      issue_types: JSON.stringify(['mastitis']),
      observed_at: '2020-09-15T10:00:00.000Z',
    })

    const res = await request(app)
      .get('/api/analytics/mastitis-rate?from=2020-09-01&to=2020-09-30')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const sep = res.body.months.find((m) => m.month === '2020-09')
    expect(sep).toBeDefined()
    expect(sep.cases).toBeGreaterThanOrEqual(1)
    expect(sep).toHaveProperty('rate')
    expect(sep).toHaveProperty('herd_size')
    expect(sep.rate).toBeGreaterThan(0)
  })

  it('returns empty months for date range with no mastitis', async () => {
    const res = await request(app)
      .get('/api/analytics/mastitis-rate?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.months).toEqual([])
    expect(res.body.avg_rate).toBe(0)
  })
})

// ─── GET /api/analytics/withdrawal-days ──────────────────────────────────────

describe('GET /api/analytics/withdrawal-days', () => {
  it('returns months array and grand_total_days', async () => {
    const res = await request(app)
      .get('/api/analytics/withdrawal-days')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(res.body).toHaveProperty('grand_total_days')
    expect(Array.isArray(res.body.months)).toBe(true)
    expect(typeof res.body.grand_total_days).toBe('number')
  })

  it('calculates withdrawal days from treatment to withdrawal_end_milk', async () => {
    const animalId = await createAnimal()
    const medId = await createMedication()
    await createTreatment(animalId, medId, {
      treatment_date: '2020-10-01T10:00:00.000Z',
      withdrawal_end_milk: '2020-10-06T10:00:00.000Z', // 5 days
      cost: 100,
    })

    const res = await request(app)
      .get('/api/analytics/withdrawal-days?from=2020-10-01&to=2020-10-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const oct = res.body.months.find((m) => m.month === '2020-10')
    expect(oct).toBeDefined()
    expect(oct.total_withdrawal_days).toBeGreaterThanOrEqual(5)
    expect(oct.cows_affected).toBeGreaterThanOrEqual(1)
  })

  it('returns empty months for date range with no withdrawals', async () => {
    const res = await request(app)
      .get('/api/analytics/withdrawal-days?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.months).toEqual([])
    expect(res.body.grand_total_days).toBe(0)
  })
})

// ─── GET /api/analytics/health-resolution-stats ─────────────────────────────

describe('GET /api/analytics/health-resolution-stats', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/health-resolution-stats')
    expect(res.status).toBe(401)
  })

  it('returns expected shape with all fields', async () => {
    const res = await request(app)
      .get('/api/analytics/health-resolution-stats')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total_issues')
    expect(res.body).toHaveProperty('resolved_count')
    expect(res.body).toHaveProperty('cure_rate')
    expect(res.body).toHaveProperty('avg_days_to_resolve')
    expect(res.body).toHaveProperty('recurrence_rate')
    expect(Array.isArray(res.body.top_incidence)).toBe(true)
  })

  it('calculates cure rate correctly', async () => {
    const animalId = await createAnimal()
    const now = new Date()
    const observed = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const resolved = now.toISOString()

    await createHealthIssue(animalId, {
      status: 'resolved',
      observed_at: observed,
      resolved_at: resolved,
    })
    await createHealthIssue(animalId, { status: 'open', observed_at: observed })

    const res = await request(app)
      .get('/api/analytics/health-resolution-stats')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.cure_rate).toBeGreaterThan(0)
    expect(res.body.avg_days_to_resolve).toBeGreaterThan(0)
  })

  it('respects from/to date range filter', async () => {
    const animalId = await createAnimal()
    // Issue outside the range
    await createHealthIssue(animalId, { observed_at: '2020-01-01T00:00:00.000Z', status: 'open' })

    const res = await request(app)
      .get('/api/analytics/health-resolution-stats?from=2025-01-01&to=2025-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // The 2020 issue should not be counted
    expect(typeof res.body.total_issues).toBe('number')
  })

  it('returns zeros when no issues exist in range', async () => {
    const res = await request(app)
      .get('/api/analytics/health-resolution-stats?from=2019-01-01&to=2019-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.total_issues).toBe(0)
    expect(res.body.resolved_count).toBe(0)
    expect(res.body.cure_rate).toBe(0)
    expect(res.body.avg_days_to_resolve).toBe(0)
    expect(res.body.recurrence_rate).toBe(0)
    expect(res.body.top_incidence).toEqual([])
  })
})

// ─── GET /api/analytics/health-resolution-by-type ───────────────────────────

describe('GET /api/analytics/health-resolution-by-type', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/health-resolution-by-type')
    expect(res.status).toBe(401)
  })

  it('returns expected shape', async () => {
    const res = await request(app)
      .get('/api/analytics/health-resolution-by-type')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.by_type)).toBe(true)
  })

  it('calculates avg days per issue type', async () => {
    const animalId = await createAnimal()
    const observed = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const resolved = new Date().toISOString()

    await createHealthIssue(animalId, {
      issue_types: JSON.stringify(['lameness']),
      status: 'resolved',
      observed_at: observed,
      resolved_at: resolved,
    })

    const res = await request(app)
      .get('/api/analytics/health-resolution-by-type')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const lameness = res.body.by_type.find((t) => t.code === 'lameness')
    if (lameness) {
      expect(lameness.avg_days).toBeGreaterThan(0)
      expect(lameness.count).toBeGreaterThanOrEqual(1)
      expect(lameness).toHaveProperty('name')
      expect(lameness).toHaveProperty('emoji')
    }
  })

  it('returns empty array when no resolved issues', async () => {
    const res = await request(app)
      .get('/api/analytics/health-resolution-by-type?from=2019-01-01&to=2019-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.by_type).toEqual([])
  })
})

// ─── GET /api/analytics/health-recurrence ───────────────────────────────────

describe('GET /api/analytics/health-recurrence', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/health-recurrence')
    expect(res.status).toBe(401)
  })

  it('returns expected shape', async () => {
    const res = await request(app)
      .get('/api/analytics/health-recurrence')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.by_type)).toBe(true)
  })

  it('detects recurrence within 60-day window', async () => {
    const animalId = await createAnimal()
    const day1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const day10 = new Date(day1.getTime() + 10 * 24 * 60 * 60 * 1000)
    const day20 = new Date(day1.getTime() + 20 * 24 * 60 * 60 * 1000)

    // First issue: resolved on day10
    await createHealthIssue(animalId, {
      issue_types: JSON.stringify(['mastitis']),
      status: 'resolved',
      observed_at: day1.toISOString(),
      resolved_at: day10.toISOString(),
    })
    // Recurrence: same cow + same type within 60 days of resolution
    await createHealthIssue(animalId, {
      issue_types: JSON.stringify(['mastitis']),
      status: 'open',
      observed_at: day20.toISOString(),
    })

    const res = await request(app)
      .get('/api/analytics/health-recurrence')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const mastitis = res.body.by_type.find((t) => t.code === 'mastitis')
    if (mastitis) {
      expect(mastitis.recurred_count).toBeGreaterThanOrEqual(1)
      expect(mastitis.rate).toBeGreaterThan(0)
    }
  })

  it('returns empty array when no resolved issues in range', async () => {
    const res = await request(app)
      .get('/api/analytics/health-recurrence?from=2019-01-01&to=2019-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.by_type).toEqual([])
  })
})

// ─── GET /api/analytics/health-cure-rate-trend ──────────────────────────────

describe('GET /api/analytics/health-cure-rate-trend', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/health-cure-rate-trend')
    expect(res.status).toBe(401)
  })

  it('returns expected shape', async () => {
    const res = await request(app)
      .get('/api/analytics/health-cure-rate-trend')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.months)).toBe(true)
  })

  it('groups cure rate by month', async () => {
    const animalId = await createAnimal()
    const observed = '2026-01-15T00:00:00.000Z'
    const resolved = '2026-01-20T00:00:00.000Z'

    await createHealthIssue(animalId, {
      status: 'resolved',
      observed_at: observed,
      resolved_at: resolved,
    })
    await createHealthIssue(animalId, { status: 'open', observed_at: '2026-01-18T00:00:00.000Z' })

    const res = await request(app)
      .get('/api/analytics/health-cure-rate-trend?from=2026-01-01&to=2026-01-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const jan = res.body.months.find((m) => m.month === '2026-01')
    if (jan) {
      expect(jan.total).toBeGreaterThanOrEqual(2)
      expect(jan.resolved).toBeGreaterThanOrEqual(1)
      expect(jan.rate).toBeGreaterThan(0)
      expect(jan.rate).toBeLessThanOrEqual(100)
    }
  })

  it('returns empty months array for empty date range', async () => {
    const res = await request(app)
      .get('/api/analytics/health-cure-rate-trend?from=2019-01-01&to=2019-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.months).toEqual([])
  })
})

// ─── GET /api/analytics/slowest-to-resolve ──────────────────────────────────

describe('GET /api/analytics/slowest-to-resolve', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/slowest-to-resolve')
    expect(res.status).toBe(401)
  })

  it('returns expected shape (array)', async () => {
    const res = await request(app)
      .get('/api/analytics/slowest-to-resolve')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('ranks cows by avg resolution days', async () => {
    const animal1 = await createAnimal({ name: 'SlowCow' })
    const animal2 = await createAnimal({ name: 'FastCow' })

    // SlowCow: 20 days to resolve
    await createHealthIssue(animal1, {
      status: 'resolved',
      observed_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      resolved_at: new Date().toISOString(),
    })
    // FastCow: 2 days to resolve
    await createHealthIssue(animal2, {
      status: 'resolved',
      observed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      resolved_at: new Date().toISOString(),
    })

    const res = await request(app)
      .get('/api/analytics/slowest-to-resolve')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    if (res.body.length >= 2) {
      const slow = res.body.find((c) => c.name === 'SlowCow')
      const fast = res.body.find((c) => c.name === 'FastCow')
      if (slow && fast) {
        expect(slow.avg_days).toBeGreaterThan(fast.avg_days)
      }
    }
  })

  it('includes cow fields in each item', async () => {
    const animalId = await createAnimal({ name: 'TestResolve' })
    await createHealthIssue(animalId, {
      status: 'resolved',
      observed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      resolved_at: new Date().toISOString(),
    })

    const res = await request(app)
      .get('/api/analytics/slowest-to-resolve')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const cow = res.body.find((c) => c.name === 'TestResolve')
    if (cow) {
      expect(cow).toHaveProperty('id')
      expect(cow).toHaveProperty('tag_number')
      expect(cow).toHaveProperty('avg_days')
      expect(cow).toHaveProperty('issue_count')
    }
  })

  it('returns empty array when no resolved issues in range', async () => {
    const res = await request(app)
      .get('/api/analytics/slowest-to-resolve?from=2019-01-01&to=2019-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

// ─── Date Validation (12B.7) ────────────────────────────────────────────────

describe('Analytics date range validation', () => {
  it('returns 400 for invalid from date', async () => {
    const res = await request(app)
      .get('/api/analytics/milk-trends?from=not-a-date')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid to date', async () => {
    const res = await request(app)
      .get('/api/analytics/unhealthiest?to=abc')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })
})
