const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers, ADMIN_ID, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken, workerToken, workerTokenWith } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ─── Factories ─────────────────────────────────────────────────────────────────

async function createAnimal(overrides = {}) {
  const id = randomUUID()
  await db('animals').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    tag_number: `BE-${id.slice(0, 6)}`,
    sex: 'female',
    status: 'active',
    ...overrides,
  })
  return id
}

async function createBreedingEvent(animalId, overrides = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('breeding_events').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    animal_id: animalId,
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

  it('returns paginated { data, total } without animal_id', async () => {
    const animalId = await createAnimal()
    await createBreedingEvent(animalId)
    await createBreedingEvent(animalId, { event_type: 'heat_observed', event_date: '2026-01-15' })

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
    const animalId = await createAnimal()
    // Create 3 events
    for (let i = 0; i < 3; i++) {
      await createBreedingEvent(animalId, { event_date: `2026-03-0${i + 1}T10:00` })
    }

    const page1 = await request(app)
      .get('/api/breeding-events?page=1&limit=2')
      .set('Authorization', adminToken())

    expect(page1.status).toBe(200)
    expect(page1.body.data.length).toBeLessThanOrEqual(2)
    expect(page1.body.total).toBeGreaterThanOrEqual(3)
  })

  it('returns plain array when animal_id is provided', async () => {
    const animalId = await createAnimal()
    await createBreedingEvent(animalId)

    const res = await request(app)
      .get(`/api/breeding-events?animal_id=${animalId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // Should NOT have data/total wrapper
    expect(res.body).not.toHaveProperty('data')
    expect(res.body).not.toHaveProperty('total')
  })

  it('filters by comma-separated event_type', async () => {
    const animalId = await createAnimal()
    await createBreedingEvent(animalId, { event_type: 'ai_insemination' })
    await createBreedingEvent(animalId, { event_type: 'heat_observed' })
    await createBreedingEvent(animalId, { event_type: 'calving', event_date: '2026-02-20' })

    const res = await request(app)
      .get(`/api/breeding-events?animal_id=${animalId}&event_type=ai_insemination,heat_observed`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.every((e) => ['ai_insemination', 'heat_observed'].includes(e.event_type))).toBe(
      true
    )
  })

  it('rejects invalid event_type', async () => {
    const res = await request(app)
      .get('/api/breeding-events?event_type=invalid_type')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Invalid event_type')
  })

  it('defaults to page=1 limit=20 when not provided', async () => {
    const res = await request(app).get('/api/breeding-events').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('data')
    expect(res.body.data.length).toBeLessThanOrEqual(20)
  })
})

// ─── POST /api/breeding-events (expected_calving override) ──────────────────

describe('POST /api/breeding-events', () => {
  it('creates a breeding event with auto-calculated dates', async () => {
    const animalId = await createAnimal()

    const res = await postEvent({
      animal_id: animalId,
      event_type: 'ai_insemination',
      event_date: '2026-02-01T10:00',
    })

    expect(res.status).toBe(201)
    expect(res.body.expected_calving).toBeDefined()
    expect(res.body.expected_preg_check).toBeDefined()
    expect(res.body.expected_next_heat).toBeDefined()
  })

  it('allows client to override expected_calving on preg_check_positive', async () => {
    const animalId = await createAnimal()

    const res = await postEvent({
      animal_id: animalId,
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
    const animalId = await createAnimal()

    // First create an insemination with auto-calculated dates
    const insemRes = await postEvent({
      animal_id: animalId,
      event_type: 'ai_insemination',
      event_date: '2026-01-15T10:00',
    })
    const expectedCalving = insemRes.body.expected_calving

    // Now create preg_check_positive WITHOUT providing expected_calving
    const res = await postEvent({
      animal_id: animalId,
      event_type: 'preg_check_positive',
      event_date: '2026-02-20T10:00',
    })

    expect(res.status).toBe(201)
    // Should carry forward from the insemination
    expect(res.body.expected_calving).toBe(expectedCalving)
  })

  it('rejects breeding events for male animals', async () => {
    const animalId = await createAnimal({ sex: 'male' })

    const res = await postEvent({
      animal_id: animalId,
      event_type: 'heat_observed',
      event_date: '2026-02-01T10:00',
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('male')
  })

  it('transitions cow status on preg_check_positive', async () => {
    const animalId = await createAnimal({ status: 'active' })

    await postEvent({
      animal_id: animalId,
      event_type: 'preg_check_positive',
      event_date: '2026-02-20T10:00',
    })

    const cow = await db('animals').where({ id: animalId }).first()
    expect(cow.status).toBe('pregnant')
  })
})

// ─── PATCH /api/breeding-events/:id ─────────────────────────────────────────

describe('PATCH /api/breeding-events/:id', () => {
  it('updates expected_calving and expected_dry_off', async () => {
    const animalId = await createAnimal()
    const evId = await createBreedingEvent(animalId, { event_type: 'preg_check_positive' })

    const res = await request(app)
      .patch(`/api/breeding-events/${evId}`)
      .set('Authorization', adminToken())
      .send({ expected_calving: '2026-12-01', expected_dry_off: '2026-10-02' })

    expect(res.status).toBe(200)
    expect(res.body.expected_calving).toContain('2026-12-01')
    expect(res.body.expected_dry_off).toContain('2026-10-02')
  })

  it('requires admin role', async () => {
    const animalId = await createAnimal()
    const evId = await createBreedingEvent(animalId)

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
    const animalId = await createAnimal()
    const evId = await createBreedingEvent(animalId)

    const res = await request(app)
      .patch(`/api/breeding-events/${evId}/dismiss`)
      .set('Authorization', adminToken())
      .send({ reason: 'Already handled' })

    expect(res.status).toBe(200)
    expect(res.body.dismissed_at).toBeDefined()
  })

  it('allows worker to dismiss', async () => {
    const animalId = await createAnimal()
    const evId = await createBreedingEvent(animalId)

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
    const animalId = await createAnimal()
    const evId = await createBreedingEvent(animalId)

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
    const animalId = await createAnimal()
    const evId = await createBreedingEvent(animalId)

    const res = await request(app)
      .delete(`/api/breeding-events/${evId}`)
      .set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })
})

// ─── dismiss-batch Joi validation (13C.8) ────────────────────────────────────

describe('PATCH /api/breeding-events/dismiss-batch validation', () => {
  it('returns 400 when ids is missing', async () => {
    const res = await request(app)
      .patch('/api/breeding-events/dismiss-batch')
      .set('Authorization', adminToken())
      .send({ reason: 'test' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('returns 400 when ids contains a non-UUID string', async () => {
    const res = await request(app)
      .patch('/api/breeding-events/dismiss-batch')
      .set('Authorization', adminToken())
      .send({ ids: ['not-a-uuid'], reason: 'test' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when reason exceeds 500 chars', async () => {
    const animalId = await createAnimal()
    const evId = await createBreedingEvent(animalId)
    const res = await request(app)
      .patch('/api/breeding-events/dismiss-batch')
      .set('Authorization', adminToken())
      .send({ ids: [evId], reason: 'x'.repeat(501) })
    expect(res.status).toBe(400)
  })

  it('dismisses multiple valid UUIDs successfully', async () => {
    const animalId = await createAnimal()
    const evId1 = await createBreedingEvent(animalId)
    const evId2 = await createBreedingEvent(animalId)

    const res = await request(app)
      .patch('/api/breeding-events/dismiss-batch')
      .set('Authorization', adminToken())
      .send({ ids: [evId1, evId2], reason: 'Batch test' })
    expect(res.status).toBe(200)
    expect(res.body.dismissed).toBe(2)
  })
})

// ─── dismiss reason length validation (13C.8) ────────────────────────────────

describe('PATCH /api/breeding-events/:id/dismiss reason validation', () => {
  it('returns 400 when reason exceeds 500 chars', async () => {
    const animalId = await createAnimal()
    const evId = await createBreedingEvent(animalId)
    const res = await request(app)
      .patch(`/api/breeding-events/${evId}/dismiss`)
      .set('Authorization', adminToken())
      .send({ reason: 'y'.repeat(501) })
    expect(res.status).toBe(400)
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

describe('GET /api/breeding-events permission enforcement', () => {
  it('returns 403 for worker without can_log_breeding', async () => {
    const token = workerTokenWith([])
    const res = await request(app).get('/api/breeding-events').set('Authorization', token)
    expect(res.status).toBe(403)
  })

  it('returns 403 for GET /upcoming without can_log_breeding', async () => {
    const token = workerTokenWith([])
    const res = await request(app).get('/api/breeding-events/upcoming').set('Authorization', token)
    expect(res.status).toBe(403)
  })
})

// ─── Universal livestock: sheep event types ───────────────────────────────────

describe('POST /api/breeding-events — sheep event types', () => {
  it('accepts ram_service event type', async () => {
    const animalId = await createAnimal({ sex: 'female' })

    const res = await postEvent({
      animal_id: animalId,
      event_type: 'ram_service',
      event_date: '2026-03-01T08:00',
    })

    expect(res.status).toBe(201)
    expect(res.body.event_type).toBe('ram_service')
  })

  it('accepts lambing event type', async () => {
    const animalId = await createAnimal({ sex: 'female' })

    const res = await postEvent({
      animal_id: animalId,
      event_type: 'lambing',
      event_date: '2026-03-15T08:00',
    })

    expect(res.status).toBe(201)
    expect(res.body.event_type).toBe('lambing')
  })

  it('stores offspring_count on birth events', async () => {
    const animalId = await createAnimal({ sex: 'female' })

    const res = await postEvent({
      animal_id: animalId,
      event_type: 'lambing',
      event_date: '2026-04-01T08:00',
      offspring_count: 3,
    })

    expect(res.status).toBe(201)
    expect(res.body.offspring_count).toBe(3)

    const row = await db('breeding_events').where({ id: res.body.id }).first()
    expect(row.offspring_count).toBe(3)
  })

  it('defaults offspring_count to 1 when not provided', async () => {
    const animalId = await createAnimal({ sex: 'female' })

    const res = await postEvent({
      animal_id: animalId,
      event_type: 'calving',
      event_date: '2026-04-10T08:00',
    })

    expect(res.status).toBe(201)
    expect(res.body.offspring_count).toBe(1)
  })

  it('rejects offspring_count > 10', async () => {
    const animalId = await createAnimal({ sex: 'female' })

    const res = await postEvent({
      animal_id: animalId,
      event_type: 'lambing',
      event_date: '2026-04-15T08:00',
      offspring_count: 11,
    })

    expect(res.status).toBe(400)
  })
})

// ─── Universal livestock: registered_offspring count ─────────────────────────

describe('GET /api/breeding-events/:id — registered_offspring', () => {
  it('includes registered_offspring count for birth events', async () => {
    const damId = await createAnimal({ sex: 'female' })
    const eventRes = await postEvent({
      animal_id: damId,
      event_type: 'calving',
      event_date: '2026-05-01T08:00',
      offspring_count: 2,
    })
    const eventId = eventRes.body.id

    // Register one offspring linked to this event
    const offspringTag = `REG-OFF-${randomUUID().slice(0, 6)}`
    await db('animals').insert({
      id: randomUUID(),
      farm_id: DEFAULT_FARM_ID,
      tag_number: offspringTag,
      sex: 'female',
      status: 'active',
      birth_event_id: eventId,
    })

    const res = await request(app)
      .get(`/api/breeding-events/${eventId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.offspring_count).toBe(2)
    expect(res.body.registered_offspring).toBe(1)
  })

  it('registered_offspring is 0 when no offspring linked', async () => {
    const damId = await createAnimal({ sex: 'female' })
    const eventRes = await postEvent({
      animal_id: damId,
      event_type: 'lambing',
      event_date: '2026-05-15T08:00',
      offspring_count: 2,
    })

    const res = await request(app)
      .get(`/api/breeding-events/${eventRes.body.id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.registered_offspring).toBe(0)
  })

  it('does not include registered_offspring for non-birth events', async () => {
    const animalId = await createAnimal({ sex: 'female' })
    const insemRes = await postEvent({
      animal_id: animalId,
      event_type: 'ai_insemination',
      event_date: '2026-05-20T08:00',
    })

    const res = await request(app)
      .get(`/api/breeding-events/${insemRes.body.id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // registered_offspring should NOT be present on non-birth events
    expect(res.body).not.toHaveProperty('registered_offspring')
  })
})

// ─── Universal livestock: event type filter accepts new types ─────────────────

describe('GET /api/breeding-events — filter accepts sheep event types', () => {
  it('accepts ram_service as event_type filter', async () => {
    const animalId = await createAnimal({ sex: 'female' })
    await createBreedingEvent(animalId, {
      event_type: 'ram_service',
      event_date: '2026-06-01T08:00',
    })

    const res = await request(app)
      .get(`/api/breeding-events?animal_id=${animalId}&event_type=ram_service`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.every((e) => e.event_type === 'ram_service')).toBe(true)
  })

  it('accepts lambing as event_type filter', async () => {
    const animalId = await createAnimal({ sex: 'female' })
    await createBreedingEvent(animalId, { event_type: 'lambing', event_date: '2026-06-10T08:00' })

    const res = await request(app)
      .get(`/api/breeding-events?animal_id=${animalId}&event_type=lambing`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.every((e) => e.event_type === 'lambing')).toBe(true)
  })
})
