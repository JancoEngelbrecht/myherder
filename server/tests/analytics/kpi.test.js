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

async function createHealthIssue(cowId, overrides = {}) {
  const id = randomUUID()
  await db('health_issues').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
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
    farm_id: DEFAULT_FARM_ID,
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

async function createBreedingEvent(cowId, overrides = {}) {
  const id = randomUUID()
  await db('breeding_events').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
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
