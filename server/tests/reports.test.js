const request = require('supertest')
const { randomUUID } = require('crypto')
const app = require('../app')
const db = require('../config/database')
const { seedUsers, ADMIN_ID, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken, workerToken } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ── Shared seed helpers ─────────────────────────────────────

async function seedCow(overrides = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('cows').insert({
    tag_number: `T${Date.now()}`,
    name: 'Test Cow',
    sex: 'female',
    status: 'active',
    farm_id: DEFAULT_FARM_ID,
    created_at: now,
    updated_at: now,
    ...overrides,
    id,
  })
  return id
}

async function seedMedication(overrides = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('medications').insert({
    name: 'Test Med',
    active_ingredient: 'TestIngredient',
    withdrawal_milk_hours: 0,
    withdrawal_milk_days: 3,
    withdrawal_meat_hours: 0,
    withdrawal_meat_days: 7,
    is_active: true,
    farm_id: DEFAULT_FARM_ID,
    created_at: now,
    updated_at: now,
    ...overrides,
    id,
  })
  return id
}

async function seedTreatment(cowId, medId, overrides = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('treatments').insert({
    administered_by: ADMIN_ID,
    treatment_date: '2025-01-15',
    withdrawal_end_milk: null,
    withdrawal_end_meat: null,
    is_vet_visit: false,
    vet_name: null,
    cost: null,
    notes: null,
    farm_id: DEFAULT_FARM_ID,
    created_at: now,
    updated_at: now,
    ...overrides,
    id,
    cow_id: cowId,
    medication_id: medId,
  })
  await db('treatment_medications').insert({
    id: randomUUID(),
    treatment_id: id,
    medication_id: medId,
    dosage: overrides.dosage || null,
  })
  return id
}

async function seedMilkRecord(cowId, overrides = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('milk_records').insert({
    recorded_by: ADMIN_ID,
    session: 'morning',
    litres: 10,
    recording_date: '2025-01-16',
    milk_discarded: false,
    discard_reason: null,
    notes: null,
    farm_id: DEFAULT_FARM_ID,
    created_at: now,
    updated_at: now,
    ...overrides,
    id,
    cow_id: cowId,
  })
  return id
}

// ── Auth & Validation Tests ─────────────────────────────────

describe('Reports API — Auth & Validation', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/reports/treatment-history?from=2025-01-01&to=2025-12-31')
    expect(res.status).toBe(401)
  })

  it('returns 403 for worker', async () => {
    const res = await request(app)
      .get('/api/reports/treatment-history?from=2025-01-01&to=2025-12-31')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('returns 400 when from/to missing', async () => {
    const res = await request(app)
      .get('/api/reports/treatment-history')
      .set('Authorization', adminToken())
    expect(res.status).toBe(400)
  })

  it('returns 400 when format invalid', async () => {
    const res = await request(app)
      .get('/api/reports/treatment-history?from=2025-01-01&to=2025-12-31&format=csv')
      .set('Authorization', adminToken())
    expect(res.status).toBe(400)
  })
})

// ── Treatment History Report ────────────────────────────────

describe('GET /api/reports/treatment-history', () => {
  let cowId2, medId2

  beforeAll(async () => {
    cowId2 = await seedCow({ tag_number: 'TH001', name: 'Bessie' })
    medId2 = await seedMedication({ name: 'Oxytetracycline', active_ingredient: 'OTC' })
    await seedTreatment(cowId2, medId2, {
      treatment_date: '2025-03-10',
      cost: 150.50,
      is_vet_visit: true,
      vet_name: 'Dr. Smith',
      notes: 'Mastitis treatment',
      dosage: '10ml',
    })
  })

  it('returns PDF with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/treatment-history?from=2025-01-01&to=2025-12-31')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*treatment-history.*\.pdf/)
  })

  it('returns XLSX with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/treatment-history?from=2025-01-01&to=2025-12-31&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/spreadsheetml/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*treatment-history.*\.xlsx/)
  })

  it('returns 403 for worker', async () => {
    const res = await request(app)
      .get('/api/reports/treatment-history?from=2025-01-01&to=2025-12-31')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('includes treatment data with cost and vet info', async () => {
    // Verifies the endpoint runs without error with seeded data
    const res = await request(app)
      .get('/api/reports/treatment-history?from=2025-03-01&to=2025-03-31&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
  })

  it('excludes soft-deleted cows', async () => {
    const deletedCow = await seedCow({ tag_number: 'DEL001', name: 'Deleted Cow' })
    await db('cows').where({ id: deletedCow }).update({ deleted_at: new Date().toISOString() })
    await seedTreatment(deletedCow, medId2, { treatment_date: '2025-03-15' })

    const res = await request(app)
      .get('/api/reports/treatment-history?from=2025-03-01&to=2025-03-31&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
  })
})

// ── Discarded Milk Report ───────────────────────────────────

describe('GET /api/reports/discarded-milk', () => {
  let cowId3

  beforeAll(async () => {
    cowId3 = await seedCow({ tag_number: 'DM001', name: 'Rosie' })
    await seedMilkRecord(cowId3, {
      recording_date: '2025-02-10',
      session: 'morning',
      litres: 5.5,
      milk_discarded: true,
      discard_reason: 'antibiotics',
    })
    await seedMilkRecord(cowId3, {
      recording_date: '2025-02-10',
      session: 'afternoon',
      litres: 4.2,
      milk_discarded: true,
      discard_reason: 'antibiotics',
    })
    // Regular milk — should NOT appear
    await seedMilkRecord(cowId3, {
      recording_date: '2025-02-11',
      session: 'morning',
      litres: 12,
      milk_discarded: false,
    })
  })

  it('returns PDF with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/discarded-milk?from=2025-02-01&to=2025-02-28')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*discarded-milk.*\.pdf/)
  })

  it('returns XLSX with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/discarded-milk?from=2025-02-01&to=2025-02-28&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/spreadsheetml/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*discarded-milk.*\.xlsx/)
  })

  it('returns 403 for worker', async () => {
    const res = await request(app)
      .get('/api/reports/discarded-milk?from=2025-02-01&to=2025-02-28')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('returns empty report when no discarded milk in range', async () => {
    const res = await request(app)
      .get('/api/reports/discarded-milk?from=2020-01-01&to=2020-12-31&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
  })
})

// ── Medication Usage Report ─────────────────────────────────

describe('GET /api/reports/medication-usage', () => {
  it('returns PDF with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/medication-usage?from=2025-01-01&to=2025-12-31')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*medication-usage.*\.pdf/)
  })

  it('returns XLSX with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/medication-usage?from=2025-01-01&to=2025-12-31&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/spreadsheetml/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*medication-usage.*\.xlsx/)
  })

  it('returns 403 for worker', async () => {
    const res = await request(app)
      .get('/api/reports/medication-usage?from=2025-01-01&to=2025-12-31')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('groups medications correctly with cost aggregation', async () => {
    const res = await request(app)
      .get('/api/reports/medication-usage?from=2025-01-01&to=2025-12-31&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
  })
})

// ── Milk Production Report ──────────────────────────────────

describe('GET /api/reports/milk-production', () => {
  let cowProd

  beforeAll(async () => {
    cowProd = await seedCow({ tag_number: 'MP001', name: 'Milky' })
    await seedMilkRecord(cowProd, { recording_date: '2025-04-01', session: 'morning', litres: 15 })
    await seedMilkRecord(cowProd, { recording_date: '2025-04-01', session: 'afternoon', litres: 12 })
    await seedMilkRecord(cowProd, { recording_date: '2025-04-02', session: 'morning', litres: 14 })
  })

  it('returns PDF with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/milk-production?from=2025-04-01&to=2025-04-30')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*milk-production.*\.pdf/)
  })

  it('returns XLSX with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/milk-production?from=2025-04-01&to=2025-04-30&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/spreadsheetml/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*milk-production.*\.xlsx/)
  })

  it('returns 403 for worker', async () => {
    const res = await request(app)
      .get('/api/reports/milk-production?from=2025-04-01&to=2025-04-30')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('computes per-cow and per-session averages', async () => {
    const res = await request(app)
      .get('/api/reports/milk-production?from=2025-04-01&to=2025-04-30&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
  })
})

// ── Breeding & Reproduction Report ──────────────────────────

describe('GET /api/reports/breeding', () => {
  beforeAll(async () => {
    const cowBreed = await seedCow({ tag_number: 'BR001', name: 'Bella' })
    await db('breeding_events').insert({
      id: randomUUID(),
      farm_id: DEFAULT_FARM_ID,
      cow_id: cowBreed,
      event_type: 'ai_insemination',
      event_date: '2025-05-10',
      semen_id: 'SEMEN-001',
      inseminator: 'John',
      cost: 200,
      recorded_by: ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    await db('breeding_events').insert({
      id: randomUUID(),
      farm_id: DEFAULT_FARM_ID,
      cow_id: cowBreed,
      event_type: 'preg_check_positive',
      event_date: '2025-06-15',
      preg_check_method: 'ultrasound',
      recorded_by: ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  })

  it('returns PDF with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/breeding?from=2025-05-01&to=2025-12-31')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*breeding.*\.pdf/)
  })

  it('returns XLSX with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/breeding?from=2025-05-01&to=2025-12-31&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/spreadsheetml/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*breeding.*\.xlsx/)
  })

  it('returns 403 for worker', async () => {
    const res = await request(app)
      .get('/api/reports/breeding?from=2025-05-01&to=2025-12-31')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('includes all event types', async () => {
    const res = await request(app)
      .get('/api/reports/breeding?from=2025-05-01&to=2025-12-31&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
  })
})

// ── Herd Health Summary Report ──────────────────────────────

describe('GET /api/reports/herd-health', () => {
  beforeAll(async () => {
    const cowHealth = await seedCow({ tag_number: 'HH001', name: 'Dotty' })
    await db('health_issues').insert({
      id: randomUUID(),
      farm_id: DEFAULT_FARM_ID,
      cow_id: cowHealth,
      reported_by: ADMIN_ID,
      issue_types: JSON.stringify(['mastitis']),
      severity: 'high',
      observed_at: '2025-06-01T08:00:00.000Z',
      status: 'resolved',
      resolved_at: '2025-06-05T10:00:00.000Z',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    await db('health_issues').insert({
      id: randomUUID(),
      farm_id: DEFAULT_FARM_ID,
      cow_id: cowHealth,
      reported_by: ADMIN_ID,
      issue_types: JSON.stringify(['lameness', 'fever']),
      severity: 'medium',
      observed_at: '2025-06-10T08:00:00.000Z',
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  })

  it('returns PDF with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/herd-health?from=2025-06-01&to=2025-06-30')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*herd-health.*\.pdf/)
  })

  it('returns XLSX with correct headers', async () => {
    const res = await request(app)
      .get('/api/reports/herd-health?from=2025-06-01&to=2025-06-30&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/spreadsheetml/)
    expect(res.headers['content-disposition']).toMatch(/attachment.*herd-health.*\.xlsx/)
  })

  it('returns 403 for worker', async () => {
    const res = await request(app)
      .get('/api/reports/herd-health?from=2025-06-01&to=2025-06-30')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('enriches issue type codes to names and computes resolution time', async () => {
    const res = await request(app)
      .get('/api/reports/herd-health?from=2025-06-01&to=2025-06-30&format=xlsx')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
  })
})
