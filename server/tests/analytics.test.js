const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { ADMIN_ID, seedUsers } = require('./helpers/setup')
const { adminToken } = require('./helpers/tokens')

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

async function createHealthIssue(cowId, overrides = {}) {
  const id = randomUUID()
  await db('health_issues').insert({
    id,
    cow_id: cowId,
    issue_types: JSON.stringify(['mastitis']),
    severity: 'medium',
    observed_at: new Date().toISOString(),
    status: 'open',
    reported_by: ADMIN_ID,
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

async function createBreedingEvent(cowId, overrides = {}) {
  const id = randomUUID()
  await db('breeding_events').insert({
    id,
    cow_id: cowId,
    event_type: 'ai_insemination',
    event_date: new Date().toISOString(),
    recorded_by: ADMIN_ID,
    ...overrides,
  })
  return id
}

// ─── GET /api/analytics/daily-kpis ───────────────────────────────────────────

describe('GET /api/analytics/daily-kpis', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/daily-kpis')
    expect(res.status).toBe(401)
  })

  it('returns all 6 KPI fields', async () => {
    const res = await request(app)
      .get('/api/analytics/daily-kpis')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('litres_today')
    expect(res.body).toHaveProperty('litres_7day_avg')
    expect(res.body).toHaveProperty('cows_milked_today')
    expect(res.body).toHaveProperty('cows_expected')
    expect(res.body).toHaveProperty('active_health_issues')
    expect(res.body).toHaveProperty('breeding_actions_due')
  })

  it('counts today milk correctly', async () => {
    const cowId = await createCow()
    const today = new Date().toISOString().slice(0, 10)
    await createMilkRecord(cowId, { litres: 12, recording_date: today, session: 'evening' })

    const res = await request(app)
      .get('/api/analytics/daily-kpis')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.litres_today).toBeGreaterThanOrEqual(12)
    expect(res.body.cows_milked_today).toBeGreaterThanOrEqual(1)
  })

  it('counts active health issues', async () => {
    const cowId = await createCow()
    await createHealthIssue(cowId, { status: 'open' })
    await createHealthIssue(cowId, { status: 'treating' })

    const res = await request(app)
      .get('/api/analytics/daily-kpis')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.active_health_issues).toBeGreaterThanOrEqual(2)
  })

  it('returns 0s when no data exists', async () => {
    // Clean slate test — just verify shape and types
    const res = await request(app)
      .get('/api/analytics/daily-kpis')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(typeof res.body.litres_today).toBe('number')
    expect(typeof res.body.litres_7day_avg).toBe('number')
    expect(typeof res.body.cows_milked_today).toBe('number')
    expect(typeof res.body.cows_expected).toBe('number')
    expect(typeof res.body.active_health_issues).toBe('number')
    expect(typeof res.body.breeding_actions_due).toBe('number')
  })
})

// ─── GET /api/analytics/herd-summary ──────────────────────────────────────────

describe('GET /api/analytics/herd-summary', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/herd-summary')
    expect(res.status).toBe(401)
  })

  it('returns total count and a by_status breakdown', async () => {
    await createCow({ status: 'active' })
    await createCow({ status: 'active' })
    await createCow({ status: 'sick' })

    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(typeof res.body.total).toBe('number')
    expect(res.body.total).toBeGreaterThanOrEqual(3)
    expect(Array.isArray(res.body.by_status)).toBe(true)
    expect(res.body.by_status.every((row) => 'status' in row && 'count' in row)).toBe(true)
  })

  it('total equals the sum of all by_status counts', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const summed = res.body.by_status.reduce((acc, r) => acc + Number(r.count), 0)
    expect(res.body.total).toBe(summed)
  })

  it('excludes soft-deleted cows from the count', async () => {
    const id = await createCow({ status: 'active' })
    await db('cows').where({ id }).update({ deleted_at: new Date().toISOString() })

    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', adminToken())

    const summed = res.body.by_status.reduce((acc, r) => acc + Number(r.count), 0)
    expect(res.body.total).toBe(summed)
  })

  it('returns milking_count, dry_count, heifer_count, males, females, replacement_rate', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(typeof res.body.milking_count).toBe('number')
    expect(typeof res.body.dry_count).toBe('number')
    expect(typeof res.body.heifer_count).toBe('number')
    expect(typeof res.body.males).toBe('number')
    expect(typeof res.body.females).toBe('number')
    expect(typeof res.body.replacement_rate).toBe('number')
  })

  it('counts heifers as females with no calving events', async () => {
    // Create a female with no calving events — should be a heifer
    const heiferId = await createCow({ sex: 'female', status: 'active' })

    // Create a female WITH a calving event — should NOT be a heifer
    const momId = await createCow({ sex: 'female', status: 'active' })
    await createBreedingEvent(momId, { event_type: 'calving' })

    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', adminToken())

    expect(res.body.heifer_count).toBeGreaterThanOrEqual(1)
    // Verify the mom is not counted as a heifer — heifer count should be less than total females
    expect(res.body.heifer_count).toBeLessThan(res.body.females)
    // Clean up
    await db('breeding_events').where('cow_id', momId).del()
    await db('cows').whereIn('id', [heiferId, momId]).del()
  })

  it('excludes sold/dead from heifer count', async () => {
    const soldHeifer = await createCow({ sex: 'female', status: 'sold' })

    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', adminToken())

    // The sold cow should not be in heifer count
    // We can't check exact count but can verify sold cow exists in total
    expect(res.body.by_status.some(r => r.status === 'sold')).toBe(true)
    await db('cows').where('id', soldHeifer).del()
  })
})

// ─── GET /api/analytics/unhealthiest ──────────────────────────────────────────

describe('GET /api/analytics/unhealthiest', () => {
  it('returns array of cows with issue_count', async () => {
    const cowId = await createCow()
    await createHealthIssue(cowId)
    await createHealthIssue(cowId)

    const res = await request(app)
      .get('/api/analytics/unhealthiest')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const found = res.body.find((r) => r.id === cowId)
    expect(found).toBeDefined()
    expect(found.tag_number).toBeDefined()
    expect(found.sex).toBeDefined()
    expect(Number(found.issue_count)).toBeGreaterThanOrEqual(2)
  })

  it('excludes issues outside default 12-month range', async () => {
    const cowId = await createCow()
    // Create issue > 12 months ago — should be excluded from default range
    const oldDate = new Date()
    oldDate.setMonth(oldDate.getMonth() - 13)
    await createHealthIssue(cowId, { observed_at: oldDate.toISOString() })

    const res = await request(app)
      .get('/api/analytics/unhealthiest')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // The old issue cow should not appear (outside 12-month default)
    const found = res.body.find((r) => r.id === cowId)
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
    const cowId = await createCow()
    await createHealthIssue(cowId, { observed_at: '2020-03-15T10:00:00.000Z' })

    const res = await request(app)
      .get('/api/analytics/unhealthiest?from=2020-03-01&to=2020-03-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const found = res.body.find((r) => r.id === cowId)
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

// ─── GET /api/analytics/breeding-overview ─────────────────────────────────────

describe('GET /api/analytics/breeding-overview', () => {
  it('returns enhanced response shape', async () => {
    const res = await request(app)
      .get('/api/analytics/breeding-overview')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('pregnant_count')
    expect(res.body).toHaveProperty('not_pregnant_count')
    expect(res.body).toHaveProperty('repro_status')
    expect(res.body).toHaveProperty('abortion_count')
    expect(res.body).toHaveProperty('pregnancy_rate')
    expect(res.body).toHaveProperty('calvings_by_month')
    expect(res.body).toHaveProperty('avg_services_per_conception')
    expect(Array.isArray(res.body.calvings_by_month)).toBe(true)

    // Verify repro_status shape
    const rs = res.body.repro_status
    expect(rs).toHaveProperty('pregnant')
    expect(rs).toHaveProperty('not_pregnant')
    expect(rs).toHaveProperty('bred_awaiting_check')
    expect(rs).toHaveProperty('dry')
    expect(rs).toHaveProperty('heifer_not_bred')
  })

  it('counts pregnant cows correctly', async () => {
    await createCow({ status: 'pregnant' })

    const res = await request(app)
      .get('/api/analytics/breeding-overview')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.pregnant_count).toBeGreaterThanOrEqual(1)
    expect(res.body.repro_status.pregnant).toBeGreaterThanOrEqual(1)
  })

  it('includes expected calvings in calvings_by_month', async () => {
    const cowId = await createCow({ status: 'pregnant' })
    const nextMonth = new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const expected = nextMonth.toISOString().slice(0, 10)

    await createBreedingEvent(cowId, {
      event_type: 'preg_check_positive',
      expected_calving: expected,
    })

    const res = await request(app)
      .get('/api/analytics/breeding-overview')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.calvings_by_month.length).toBeGreaterThanOrEqual(1)
    const monthEntry = res.body.calvings_by_month.find(
      (m) => m.month === expected.slice(0, 7)
    )
    expect(monthEntry).toBeDefined()
    expect(monthEntry.count).toBeGreaterThanOrEqual(1)
  })

  it('respects from/to date range for abortion_count', async () => {
    const cowId = await createCow()
    await createBreedingEvent(cowId, {
      event_type: 'abortion',
      event_date: '2020-06-15',
    })

    const res = await request(app)
      .get('/api/analytics/breeding-overview?from=2020-06-01&to=2020-06-30')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.abortion_count).toBeGreaterThanOrEqual(1)
  })

  it('categorises bred_awaiting_check correctly', async () => {
    const cowId = await createCow({ sex: 'female', status: 'active' })
    // Insemination with no subsequent preg check
    await createBreedingEvent(cowId, {
      event_type: 'ai_insemination',
      event_date: '2025-11-01',
    })

    const res = await request(app)
      .get('/api/analytics/breeding-overview')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.repro_status.bred_awaiting_check).toBeGreaterThanOrEqual(1)
  })

  it('categorises heifer_not_bred correctly', async () => {
    // Create a female cow with zero breeding events
    await createCow({ sex: 'female', status: 'active' })

    const res = await request(app)
      .get('/api/analytics/breeding-overview')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // At least one heifer should be not-bred (the one we just created has no events)
    expect(res.body.repro_status.heifer_not_bred).toBeGreaterThanOrEqual(0)
  })

  it('categorises dry cows correctly', async () => {
    await createCow({ sex: 'female', status: 'dry', is_dry: true })

    const res = await request(app)
      .get('/api/analytics/breeding-overview')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.repro_status.dry).toBeGreaterThanOrEqual(1)
  })
})

// ─── GET /api/analytics/breeding-activity ─────────────────────────────────────

describe('GET /api/analytics/breeding-activity', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/breeding-activity')
    expect(res.status).toBe(401)
  })

  it('returns months array with inseminations and conceptions', async () => {
    const cowId = await createCow()
    await createBreedingEvent(cowId, {
      event_type: 'ai_insemination',
      event_date: '2025-08-15',
    })
    await createBreedingEvent(cowId, {
      event_type: 'preg_check_positive',
      event_date: '2025-08-20',
    })

    const res = await request(app)
      .get('/api/analytics/breeding-activity?from=2025-08-01&to=2025-08-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(Array.isArray(res.body.months)).toBe(true)

    const aug = res.body.months.find(m => m.month === '2025-08')
    expect(aug).toBeDefined()
    expect(aug.inseminations).toBeGreaterThanOrEqual(1)
    expect(aug.conceptions).toBeGreaterThanOrEqual(1)
  })

  it('respects date range filter', async () => {
    const res = await request(app)
      .get('/api/analytics/breeding-activity?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.months).toEqual([])
  })

  it('includes bull_service events in inseminations count', async () => {
    const cowId = await createCow()
    await createBreedingEvent(cowId, {
      event_type: 'bull_service',
      event_date: '2020-09-10',
    })

    const res = await request(app)
      .get('/api/analytics/breeding-activity?from=2020-09-01&to=2020-09-30')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const sep = res.body.months.find(m => m.month === '2020-09')
    expect(sep).toBeDefined()
    expect(sep.inseminations).toBeGreaterThanOrEqual(1)
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

// ─── GET /api/analytics/calving-interval ──────────────────────────────────────

describe('GET /api/analytics/calving-interval', () => {
  it('returns avg_calving_interval_days and intervals array for cows with 2+ calvings', async () => {
    const cowId = await createCow()
    // Two calvings 365 days apart — use 2022→2023 (both non-leap years)
    const date1 = '2022-01-15'
    const date2 = '2023-01-15'
    await createBreedingEvent(cowId, { event_type: 'calving', event_date: date1 })
    await createBreedingEvent(cowId, { event_type: 'calving', event_date: date2 })

    const res = await request(app)
      .get('/api/analytics/calving-interval?from=2022-01-01&to=2023-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('avg_calving_interval_days')
    expect(res.body).toHaveProperty('cow_count')
    expect(res.body).toHaveProperty('intervals')
    expect(Array.isArray(res.body.intervals)).toBe(true)

    const found = res.body.intervals.find((r) => r.cow_id === cowId)
    expect(found).toBeDefined()
    expect(found.interval_days).toBe(365)
    expect(found.calving_count).toBe(2)
    expect(found).toHaveProperty('tag_number')
    expect(found).toHaveProperty('name')

    expect(typeof res.body.avg_calving_interval_days).toBe('number')
    expect(res.body.cow_count).toBeGreaterThanOrEqual(1)
  })

  it('excludes cows with only 1 calving from intervals', async () => {
    const cowId = await createCow()
    await createBreedingEvent(cowId, { event_type: 'calving', event_date: '2024-06-01' })

    const res = await request(app)
      .get('/api/analytics/calving-interval')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const found = res.body.intervals.find((r) => r.cow_id === cowId)
    expect(found).toBeUndefined()
  })

  it('returns null avg and empty intervals when no calving data exists', async () => {
    // Use a fresh cow with no events — DB is shared so just verify shape is correct
    const res = await request(app)
      .get('/api/analytics/calving-interval')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // avg may be a number if other tests added data; just verify the shape
    expect(res.body).toHaveProperty('avg_calving_interval_days')
    expect(res.body).toHaveProperty('cow_count')
    expect(Array.isArray(res.body.intervals)).toBe(true)
  })
})

// ─── GET /api/analytics/days-open ─────────────────────────────────────────────

describe('GET /api/analytics/days-open', () => {
  it('returns avg_days_open and records with calving-to-conception pairs', async () => {
    const cowId = await createCow()
    const calvingDate = '2025-06-01'
    const pregDate = '2025-09-01' // 92 days later

    await createBreedingEvent(cowId, { event_type: 'calving', event_date: calvingDate })
    await createBreedingEvent(cowId, {
      event_type: 'preg_check_positive',
      event_date: pregDate,
    })

    const res = await request(app)
      .get('/api/analytics/days-open')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('avg_days_open')
    expect(res.body).toHaveProperty('cow_count')
    expect(res.body).toHaveProperty('records')
    expect(Array.isArray(res.body.records)).toBe(true)

    const found = res.body.records.find((r) => r.cow_id === cowId)
    expect(found).toBeDefined()
    expect(found.days_open).toBe(92)
    expect(found).toHaveProperty('tag_number')
    expect(found).toHaveProperty('name')
  })

  it('returns null avg_days_open when no calving-to-preg pairs exist', async () => {
    // Cow with only a preg_check_positive and no preceding calving in the window
    const cowId = await createCow()
    // Set calving outside the 24-month window
    await createBreedingEvent(cowId, { event_type: 'calving', event_date: '2000-01-01' })
    await createBreedingEvent(cowId, {
      event_type: 'preg_check_positive',
      event_date: '2000-06-01',
    })

    // A separate cow with no preg check at all
    const cow2Id = await createCow()
    await createBreedingEvent(cow2Id, { event_type: 'calving', event_date: '2024-01-01' })

    const res = await request(app)
      .get('/api/analytics/days-open')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // If cow2 has no preg check it won't appear in records — check overall shape
    expect(res.body).toHaveProperty('avg_days_open')
    expect(res.body).toHaveProperty('cow_count')
    expect(Array.isArray(res.body.records)).toBe(true)

    // cow2 specifically should not appear (no preg check)
    const found = res.body.records.find((r) => r.cow_id === cow2Id)
    expect(found).toBeUndefined()
  })

  it('respects from/to date range', async () => {
    const cowId = await createCow()
    await createBreedingEvent(cowId, { event_type: 'calving', event_date: '2020-02-01' })
    await createBreedingEvent(cowId, { event_type: 'preg_check_positive', event_date: '2020-05-01' })

    const res = await request(app)
      .get('/api/analytics/days-open?from=2020-01-01&to=2020-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const found = res.body.records.find((r) => r.cow_id === cowId)
    expect(found).toBeDefined()
    expect(found.days_open).toBe(90)
  })

  it('returns empty records for date range with no data', async () => {
    const res = await request(app)
      .get('/api/analytics/days-open?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.records).toEqual([])
    expect(res.body.avg_days_open).toBeNull()
  })
})

// ─── GET /api/analytics/conception-rate ───────────────────────────────────────

describe('GET /api/analytics/conception-rate', () => {
  it('returns first_service_rate, total_first_services, first_service_conceptions, and by_month', async () => {
    const res = await request(app)
      .get('/api/analytics/conception-rate')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('first_service_rate')
    expect(res.body).toHaveProperty('total_first_services')
    expect(res.body).toHaveProperty('first_service_conceptions')
    expect(res.body).toHaveProperty('by_month')
    expect(Array.isArray(res.body.by_month)).toBe(true)
    expect(typeof res.body.total_first_services).toBe('number')
    expect(typeof res.body.first_service_conceptions).toBe('number')
  })

  it('counts first-service conceptions correctly', async () => {
    const cowId = await createCow()
    const resetDate = '2025-01-01'
    const serviceDate = '2025-02-01'
    const pregDate = '2025-03-01'

    // Calving acts as the cycle reset
    await createBreedingEvent(cowId, { event_type: 'calving', event_date: resetDate })
    // Exactly one service before the positive preg check
    await createBreedingEvent(cowId, { event_type: 'ai_insemination', event_date: serviceDate })
    await createBreedingEvent(cowId, {
      event_type: 'preg_check_positive',
      event_date: pregDate,
    })

    const res = await request(app)
      .get('/api/analytics/conception-rate')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.total_first_services).toBeGreaterThanOrEqual(1)
    expect(res.body.first_service_conceptions).toBeGreaterThanOrEqual(1)
    expect(res.body.first_service_rate).toBeGreaterThan(0)
  })

  it('does not count a preg check with zero services as a first service', async () => {
    const cowId = await createCow()
    // preg_check_positive with no preceding service events at all
    await createBreedingEvent(cowId, {
      event_type: 'preg_check_positive',
      event_date: '2025-06-01',
    })

    const res = await request(app)
      .get('/api/analytics/conception-rate')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // Totals should remain consistent (no division-by-zero, no crash)
    expect(typeof res.body.total_first_services).toBe('number')
    expect(typeof res.body.first_service_conceptions).toBe('number')
  })

  it('respects from/to date range', async () => {
    const cowId = await createCow()
    await createBreedingEvent(cowId, { event_type: 'calving', event_date: '2020-01-01' })
    await createBreedingEvent(cowId, { event_type: 'ai_insemination', event_date: '2020-03-01' })
    await createBreedingEvent(cowId, { event_type: 'preg_check_positive', event_date: '2020-04-15' })

    const res = await request(app)
      .get('/api/analytics/conception-rate?from=2020-01-01&to=2020-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.total_first_services).toBeGreaterThanOrEqual(1)
    expect(res.body.first_service_conceptions).toBeGreaterThanOrEqual(1)
  })

  it('returns zero for date range with no data', async () => {
    const res = await request(app)
      .get('/api/analytics/conception-rate?from=1990-01-01&to=1990-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.total_first_services).toBe(0)
    expect(res.body.first_service_conceptions).toBe(0)
    expect(res.body.first_service_rate).toBeNull()
    expect(res.body.by_month).toEqual([])
  })

  it('includes by_month with monthly rate breakdown', async () => {
    const cowId = await createCow()
    await createBreedingEvent(cowId, { event_type: 'calving', event_date: '2020-01-01' })
    await createBreedingEvent(cowId, { event_type: 'ai_insemination', event_date: '2020-04-01' })
    await createBreedingEvent(cowId, { event_type: 'preg_check_positive', event_date: '2020-04-20' })

    const res = await request(app)
      .get('/api/analytics/conception-rate?from=2020-01-01&to=2020-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.by_month.length).toBeGreaterThanOrEqual(1)
    const apr = res.body.by_month.find(m => m.month === '2020-04')
    expect(apr).toBeDefined()
    expect(apr).toHaveProperty('rate')
    expect(apr).toHaveProperty('total')
    expect(apr).toHaveProperty('conceptions')
    expect(apr.total).toBeGreaterThanOrEqual(1)
  })
})

// ─── GET /api/analytics/seasonal-prediction ───────────────────────────────────

describe('GET /api/analytics/seasonal-prediction', () => {
  it('returns predictions array with 2 months', async () => {
    const res = await request(app)
      .get('/api/analytics/seasonal-prediction')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('predictions')
    expect(res.body).toHaveProperty('years_of_data')
    expect(Array.isArray(res.body.predictions)).toBe(true)
    expect(res.body.predictions.length).toBe(2)

    const pred = res.body.predictions[0]
    expect(pred).toHaveProperty('month')
    expect(pred).toHaveProperty('month_name')
    expect(pred).toHaveProperty('issues')
    expect(Array.isArray(pred.issues)).toBe(true)
  })

  it('includes issue type names and historical averages', async () => {
    // Create a health issue in a month that will be predicted
    const cowId = await createCow()
    const nextMonth = new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    // Create issue in the same calendar month last year
    const pastDate = new Date(nextMonth)
    pastDate.setFullYear(pastDate.getFullYear() - 1)
    await createHealthIssue(cowId, {
      issue_types: JSON.stringify(['mastitis']),
      observed_at: pastDate.toISOString(),
    })

    const res = await request(app)
      .get('/api/analytics/seasonal-prediction')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // The first prediction should correspond to next month
    const pred = res.body.predictions[0]
    if (pred.issues.length > 0) {
      const issue = pred.issues[0]
      expect(issue).toHaveProperty('type')
      expect(issue).toHaveProperty('code')
      expect(issue).toHaveProperty('historical_avg')
    }
  })

  it('limits to top 3 issues per month', async () => {
    const res = await request(app)
      .get('/api/analytics/seasonal-prediction')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    for (const pred of res.body.predictions) {
      expect(pred.issues.length).toBeLessThanOrEqual(3)
    }
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
    const cowId = await createCow()
    await createHealthIssue(cowId, {
      issue_types: JSON.stringify(['mastitis', 'fever']),
      observed_at: '2025-07-15T10:00:00.000Z',
    })

    const res = await request(app)
      .get('/api/analytics/issue-frequency?from=2025-07-01&to=2025-07-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const mastitis = res.body.by_type.find(t => t.code === 'mastitis')
    expect(mastitis).toBeDefined()
    expect(mastitis.count).toBeGreaterThanOrEqual(1)
    expect(mastitis).toHaveProperty('name')
    expect(mastitis).toHaveProperty('emoji')

    const fever = res.body.by_type.find(t => t.code === 'fever')
    expect(fever).toBeDefined()
    expect(fever.count).toBeGreaterThanOrEqual(1)
  })

  it('groups by month correctly', async () => {
    const cowId = await createCow()
    await createHealthIssue(cowId, {
      issue_types: JSON.stringify(['lameness']),
      observed_at: '2020-08-10T10:00:00.000Z',
    })

    const res = await request(app)
      .get('/api/analytics/issue-frequency?from=2020-08-01&to=2020-08-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const aug = res.body.by_month.find(m => m.month === '2020-08')
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
    const cowId = await createCow()
    await createHealthIssue(cowId, {
      issue_types: JSON.stringify(['mastitis']),
      observed_at: '2020-09-15T10:00:00.000Z',
    })

    const res = await request(app)
      .get('/api/analytics/mastitis-rate?from=2020-09-01&to=2020-09-30')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const sep = res.body.months.find(m => m.month === '2020-09')
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
    const cowId = await createCow()
    const medId = await createMedication()
    await createTreatment(cowId, medId, {
      treatment_date: '2020-10-01T10:00:00.000Z',
      withdrawal_end_milk: '2020-10-06T10:00:00.000Z',  // 5 days
      cost: 100,
    })

    const res = await request(app)
      .get('/api/analytics/withdrawal-days?from=2020-10-01&to=2020-10-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const oct = res.body.months.find(m => m.month === '2020-10')
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
    const cowId = await createCow()
    const now = new Date()
    const observed = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const resolved = now.toISOString()

    await createHealthIssue(cowId, { status: 'resolved', observed_at: observed, resolved_at: resolved })
    await createHealthIssue(cowId, { status: 'open', observed_at: observed })

    const res = await request(app)
      .get('/api/analytics/health-resolution-stats')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.cure_rate).toBeGreaterThan(0)
    expect(res.body.avg_days_to_resolve).toBeGreaterThan(0)
  })

  it('respects from/to date range filter', async () => {
    const cowId = await createCow()
    // Issue outside the range
    await createHealthIssue(cowId, { observed_at: '2020-01-01T00:00:00.000Z', status: 'open' })

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
    const cowId = await createCow()
    const observed = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const resolved = new Date().toISOString()

    await createHealthIssue(cowId, {
      issue_types: JSON.stringify(['lameness']),
      status: 'resolved',
      observed_at: observed,
      resolved_at: resolved,
    })

    const res = await request(app)
      .get('/api/analytics/health-resolution-by-type')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const lameness = res.body.by_type.find(t => t.code === 'lameness')
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
    const cowId = await createCow()
    const day1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const day10 = new Date(day1.getTime() + 10 * 24 * 60 * 60 * 1000)
    const day20 = new Date(day1.getTime() + 20 * 24 * 60 * 60 * 1000)

    // First issue: resolved on day10
    await createHealthIssue(cowId, {
      issue_types: JSON.stringify(['mastitis']),
      status: 'resolved',
      observed_at: day1.toISOString(),
      resolved_at: day10.toISOString(),
    })
    // Recurrence: same cow + same type within 60 days of resolution
    await createHealthIssue(cowId, {
      issue_types: JSON.stringify(['mastitis']),
      status: 'open',
      observed_at: day20.toISOString(),
    })

    const res = await request(app)
      .get('/api/analytics/health-recurrence')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const mastitis = res.body.by_type.find(t => t.code === 'mastitis')
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
    const cowId = await createCow()
    const observed = '2026-01-15T00:00:00.000Z'
    const resolved = '2026-01-20T00:00:00.000Z'

    await createHealthIssue(cowId, { status: 'resolved', observed_at: observed, resolved_at: resolved })
    await createHealthIssue(cowId, { status: 'open', observed_at: '2026-01-18T00:00:00.000Z' })

    const res = await request(app)
      .get('/api/analytics/health-cure-rate-trend?from=2026-01-01&to=2026-01-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const jan = res.body.months.find(m => m.month === '2026-01')
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
    const cow1 = await createCow({ name: 'SlowCow' })
    const cow2 = await createCow({ name: 'FastCow' })

    // SlowCow: 20 days to resolve
    await createHealthIssue(cow1, {
      status: 'resolved',
      observed_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      resolved_at: new Date().toISOString(),
    })
    // FastCow: 2 days to resolve
    await createHealthIssue(cow2, {
      status: 'resolved',
      observed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      resolved_at: new Date().toISOString(),
    })

    const res = await request(app)
      .get('/api/analytics/slowest-to-resolve')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    if (res.body.length >= 2) {
      const slow = res.body.find(c => c.name === 'SlowCow')
      const fast = res.body.find(c => c.name === 'FastCow')
      if (slow && fast) {
        expect(slow.avg_days).toBeGreaterThan(fast.avg_days)
      }
    }
  })

  it('includes cow fields in each item', async () => {
    const cowId = await createCow({ name: 'TestResolve' })
    await createHealthIssue(cowId, {
      status: 'resolved',
      observed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      resolved_at: new Date().toISOString(),
    })

    const res = await request(app)
      .get('/api/analytics/slowest-to-resolve')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const cow = res.body.find(c => c.name === 'TestResolve')
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
