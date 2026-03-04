const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers, ADMIN_ID } = require('./helpers/setup')
const { adminToken, workerToken } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ─── Factories ─────────────────────────────────────────────────────────────────

async function createCow(overrides = {}) {
  const id = randomUUID()
  await db('cows').insert({
    id,
    tag_number: `BE-${id.slice(0, 6)}`,
    sex: 'female',
    status: 'active',
    ...overrides,
  })
  return id
}

async function createBreedingEvent(cowId, overrides = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('breeding_events').insert({
    id,
    cow_id: cowId,
    event_type: 'ai_insemination',
    event_date: '2026-02-01T10:00',
    recorded_by: ADMIN_ID,
    created_at: now,
    updated_at: now,
    ...overrides,
  })
  return id
}

function postEvent(body) {
  return request(app).post('/api/breeding-events').set('Authorization', adminToken()).send(body)
}

// ─── GET /api/breeding-events (pagination) ──────────────────────────────────

describe('GET /api/breeding-events', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/breeding-events')
    expect(res.status).toBe(401)
  })

  it('returns paginated { data, total } without cow_id', async () => {
    const cowId = await createCow()
    await createBreedingEvent(cowId)
    await createBreedingEvent(cowId, { event_type: 'heat_observed', event_date: '2026-01-15' })

    const res = await request(app)
      .get('/api/breeding-events?page=1&limit=10')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('data')
    expect(res.body).toHaveProperty('total')
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(typeof res.body.total).toBe('number')
    expect(res.body.total).toBeGreaterThanOrEqual(2)
  })

  it('paginates correctly with page and limit', async () => {
    const cowId = await createCow()
    // Create 3 events
    for (let i = 0; i < 3; i++) {
      await createBreedingEvent(cowId, { event_date: `2026-03-0${i + 1}T10:00` })
    }

    const page1 = await request(app)
      .get('/api/breeding-events?page=1&limit=2')
      .set('Authorization', adminToken())

    expect(page1.status).toBe(200)
    expect(page1.body.data.length).toBeLessThanOrEqual(2)
    expect(page1.body.total).toBeGreaterThanOrEqual(3)
  })

  it('returns plain array when cow_id is provided', async () => {
    const cowId = await createCow()
    await createBreedingEvent(cowId)

    const res = await request(app)
      .get(`/api/breeding-events?cow_id=${cowId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // Should NOT have data/total wrapper
    expect(res.body).not.toHaveProperty('data')
    expect(res.body).not.toHaveProperty('total')
  })

  it('filters by comma-separated event_type', async () => {
    const cowId = await createCow()
    await createBreedingEvent(cowId, { event_type: 'ai_insemination' })
    await createBreedingEvent(cowId, { event_type: 'heat_observed' })
    await createBreedingEvent(cowId, { event_type: 'calving', event_date: '2026-02-20' })

    const res = await request(app)
      .get(`/api/breeding-events?cow_id=${cowId}&event_type=ai_insemination,heat_observed`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.every((e) => ['ai_insemination', 'heat_observed'].includes(e.event_type))).toBe(true)
  })

  it('rejects invalid event_type', async () => {
    const res = await request(app)
      .get('/api/breeding-events?event_type=invalid_type')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Invalid event_type')
  })

  it('defaults to page=1 limit=20 when not provided', async () => {
    const res = await request(app)
      .get('/api/breeding-events')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('data')
    expect(res.body.data.length).toBeLessThanOrEqual(20)
  })
})

// ─── POST /api/breeding-events (expected_calving override) ──────────────────

describe('POST /api/breeding-events', () => {
  it('creates a breeding event with auto-calculated dates', async () => {
    const cowId = await createCow()

    const res = await postEvent({
      cow_id: cowId,
      event_type: 'ai_insemination',
      event_date: '2026-02-01T10:00',
    })

    expect(res.status).toBe(201)
    expect(res.body.expected_calving).toBeDefined()
    expect(res.body.expected_preg_check).toBeDefined()
    expect(res.body.expected_next_heat).toBeDefined()
  })

  it('allows client to override expected_calving on preg_check_positive', async () => {
    const cowId = await createCow()

    const res = await postEvent({
      cow_id: cowId,
      event_type: 'preg_check_positive',
      event_date: '2026-03-10T10:00',
      expected_calving: '2026-10-15',
      expected_dry_off: '2026-08-16',
    })

    expect(res.status).toBe(201)
    expect(res.body.expected_calving).toContain('2026-10-15')
    expect(res.body.expected_dry_off).toContain('2026-08-16')
  })

  it('falls back to latest insemination calving date for preg_check_positive', async () => {
    const cowId = await createCow()

    // First create an insemination with auto-calculated dates
    const insemRes = await postEvent({
      cow_id: cowId,
      event_type: 'ai_insemination',
      event_date: '2026-01-15T10:00',
    })
    const expectedCalving = insemRes.body.expected_calving

    // Now create preg_check_positive WITHOUT providing expected_calving
    const res = await postEvent({
      cow_id: cowId,
      event_type: 'preg_check_positive',
      event_date: '2026-02-20T10:00',
    })

    expect(res.status).toBe(201)
    // Should carry forward from the insemination
    expect(res.body.expected_calving).toBe(expectedCalving)
  })

  it('rejects breeding events for male animals', async () => {
    const cowId = await createCow({ sex: 'male' })

    const res = await postEvent({
      cow_id: cowId,
      event_type: 'heat_observed',
      event_date: '2026-02-01T10:00',
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('male')
  })

  it('transitions cow status on preg_check_positive', async () => {
    const cowId = await createCow({ status: 'active' })

    await postEvent({
      cow_id: cowId,
      event_type: 'preg_check_positive',
      event_date: '2026-02-20T10:00',
    })

    const cow = await db('cows').where({ id: cowId }).first()
    expect(cow.status).toBe('pregnant')
  })
})

// ─── PATCH /api/breeding-events/:id ─────────────────────────────────────────

describe('PATCH /api/breeding-events/:id', () => {
  it('updates expected_calving and expected_dry_off', async () => {
    const cowId = await createCow()
    const evId = await createBreedingEvent(cowId, { event_type: 'preg_check_positive' })

    const res = await request(app)
      .patch(`/api/breeding-events/${evId}`)
      .set('Authorization', adminToken())
      .send({ expected_calving: '2026-12-01', expected_dry_off: '2026-10-02' })

    expect(res.status).toBe(200)
    expect(res.body.expected_calving).toContain('2026-12-01')
    expect(res.body.expected_dry_off).toContain('2026-10-02')
  })

  it('requires admin role', async () => {
    const cowId = await createCow()
    const evId = await createBreedingEvent(cowId)

    const res = await request(app)
      .patch(`/api/breeding-events/${evId}`)
      .set('Authorization', workerToken())
      .send({ notes: 'test' })

    expect(res.status).toBe(403)
  })
})

// ─── PATCH /api/breeding-events/:id/dismiss ─────────────────────────────────

describe('PATCH /api/breeding-events/:id/dismiss', () => {
  it('dismisses an event', async () => {
    const cowId = await createCow()
    const evId = await createBreedingEvent(cowId)

    const res = await request(app)
      .patch(`/api/breeding-events/${evId}/dismiss`)
      .set('Authorization', adminToken())
      .send({ reason: 'Already handled' })

    expect(res.status).toBe(200)
    expect(res.body.dismissed_at).toBeDefined()
  })

  it('allows worker to dismiss', async () => {
    const cowId = await createCow()
    const evId = await createBreedingEvent(cowId)

    const res = await request(app)
      .patch(`/api/breeding-events/${evId}/dismiss`)
      .set('Authorization', workerToken())
      .send({})

    expect(res.status).toBe(200)
  })
})

// ─── DELETE /api/breeding-events/:id ────────────────────────────────────────

describe('DELETE /api/breeding-events/:id', () => {
  it('deletes a breeding event (admin only)', async () => {
    const cowId = await createCow()
    const evId = await createBreedingEvent(cowId)

    const res = await request(app)
      .delete(`/api/breeding-events/${evId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)

    const check = await request(app)
      .get(`/api/breeding-events/${evId}`)
      .set('Authorization', adminToken())
    expect(check.status).toBe(404)
  })

  it('rejects worker delete', async () => {
    const cowId = await createCow()
    const evId = await createBreedingEvent(cowId)

    const res = await request(app)
      .delete(`/api/breeding-events/${evId}`)
      .set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })
})

// ─── Query Validation (12B.8) ───────────────────────────────────────────────

describe('GET /api/breeding-events query validation', () => {
  it('returns 400 for invalid date_from', async () => {
    const res = await request(app)
      .get('/api/breeding-events?date_from=bad')
      .set('Authorization', adminToken())
    expect(res.status).toBe(400)
  })
})
