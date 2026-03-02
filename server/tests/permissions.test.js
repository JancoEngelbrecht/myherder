const { randomUUID } = require('crypto')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { WORKER_ID, seedUsers } = require('./helpers/setup')
const { adminToken } = require('./helpers/tokens')
const { jwtSecret } = require('../config/env')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ── Token helper ───────────────────────────────────────────────────────────

/** Generate a Bearer token for the worker with specific permissions */
function tokenWith(permissions) {
  const payload = {
    id: WORKER_ID,
    username: 'test_worker',
    full_name: 'Test Worker',
    role: 'worker',
    permissions,
    language: 'en',
  }
  return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
}

const noPerms = tokenWith([])

// ── Seed helpers ───────────────────────────────────────────────────────────

let cowId
let medicationId

beforeAll(async () => {
  // Seed a cow for use in permission tests
  cowId = randomUUID()
  await db('cows').insert({
    id: cowId,
    tag_number: 'PERM-001',
    sex: 'female',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  // Seed a medication for treatment tests
  medicationId = randomUUID()
  await db('medications').insert({
    id: medicationId,
    name: 'Test Med',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

// ── can_record_milk ───────────────────────────────────────────────────────

describe('can_record_milk permission', () => {
  it('returns 403 on POST /api/milk-records without permission', async () => {
    const res = await request(app)
      .post('/api/milk-records')
      .set('Authorization', noPerms)
      .send({
        cow_id: cowId,
        litres: 5,
        session: 'morning',
        recording_date: '2026-03-01',
      })
    expect(res.status).toBe(403)
  })

  it('returns 201 on POST /api/milk-records with permission', async () => {
    const res = await request(app)
      .post('/api/milk-records')
      .set('Authorization', tokenWith(['can_record_milk']))
      .send({
        cow_id: cowId,
        litres: 5,
        session: 'morning',
        recording_date: '2026-03-01',
      })
    expect(res.status).toBe(201)
  })
})

// ── can_log_issues ────────────────────────────────────────────────────────

describe('can_log_issues permission', () => {
  it('returns 403 on POST /api/health-issues without permission', async () => {
    const res = await request(app)
      .post('/api/health-issues')
      .set('Authorization', noPerms)
      .send({
        cow_id: cowId,
        issue_types: ['mastitis'],
        observed_at: '2026-03-01T08:00:00.000Z',
      })
    expect(res.status).toBe(403)
  })

  it('returns 201 on POST /api/health-issues with permission', async () => {
    const res = await request(app)
      .post('/api/health-issues')
      .set('Authorization', tokenWith(['can_log_issues']))
      .send({
        cow_id: cowId,
        issue_types: ['mastitis'],
        observed_at: '2026-03-01T08:00:00.000Z',
      })
    expect(res.status).toBe(201)
  })
})

// ── can_log_treatments ────────────────────────────────────────────────────

describe('can_log_treatments permission', () => {
  it('returns 403 on POST /api/treatments without permission', async () => {
    const res = await request(app)
      .post('/api/treatments')
      .set('Authorization', noPerms)
      .send({
        cow_id: cowId,
        medications: [{ medication_id: medicationId }],
        treatment_date: '2026-03-01T08:00:00.000Z',
      })
    expect(res.status).toBe(403)
  })

  it('returns 201 on POST /api/treatments with permission', async () => {
    const res = await request(app)
      .post('/api/treatments')
      .set('Authorization', tokenWith(['can_log_treatments']))
      .send({
        cow_id: cowId,
        medications: [{ medication_id: medicationId }],
        treatment_date: '2026-03-01T08:00:00.000Z',
      })
    expect(res.status).toBe(201)
  })
})

// ── can_log_breeding ──────────────────────────────────────────────────────

describe('can_log_breeding permission', () => {
  it('returns 403 on POST /api/breeding-events without permission', async () => {
    const res = await request(app)
      .post('/api/breeding-events')
      .set('Authorization', noPerms)
      .send({
        cow_id: cowId,
        event_type: 'heat_observed',
        event_date: '2026-03-01T08:00:00.000Z',
      })
    expect(res.status).toBe(403)
  })

  it('returns 201 on POST /api/breeding-events with permission', async () => {
    const res = await request(app)
      .post('/api/breeding-events')
      .set('Authorization', tokenWith(['can_log_breeding']))
      .send({
        cow_id: cowId,
        event_type: 'heat_observed',
        event_date: '2026-03-01T08:00:00.000Z',
      })
    expect(res.status).toBe(201)
  })
})

// ── can_view_analytics ────────────────────────────────────────────────────

describe('can_view_analytics permission', () => {
  it('returns 403 on GET /api/analytics/herd-summary without permission', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', noPerms)
    expect(res.status).toBe(403)
  })

  it('returns 200 on GET /api/analytics/herd-summary with permission', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', tokenWith(['can_view_analytics']))
    expect(res.status).toBe(200)
  })
})

// ── Admin bypasses all ────────────────────────────────────────────────────

describe('admin bypasses all permission checks', () => {
  it('admin can POST /api/milk-records', async () => {
    const res = await request(app)
      .post('/api/milk-records')
      .set('Authorization', adminToken())
      .send({
        cow_id: cowId,
        litres: 8,
        session: 'afternoon',
        recording_date: '2026-03-01',
      })
    expect(res.status).toBe(201)
  })

  it('admin can GET /api/analytics/herd-summary', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
  })
})
