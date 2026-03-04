const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers } = require('./helpers/setup')
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
    tag_number: `T-COW-${id.slice(0, 6)}`,
    sex: 'female',
    status: 'active',
    ...overrides,
  })
  return id
}

async function createMedication(overrides = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('medications').insert({
    id,
    name: `TxMed-${id.slice(0, 6)}`,
    withdrawal_milk_hours: 0,
    withdrawal_meat_days: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  })
  return id
}

function postTreatment(body) {
  return request(app).post('/api/treatments').set('Authorization', adminToken()).send(body)
}

// ─── POST /api/treatments ──────────────────────────────────────────────────────

describe('POST /api/treatments', () => {
  it('creates a treatment with a single medication and returns 201', async () => {
    const cowId = await createCow()
    const medId = await createMedication()

    const res = await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: medId, dosage: '5ml' }],
      treatment_date: '2026-01-15T10:00:00.000Z',
    })

    expect(res.status).toBe(201)
    expect(res.body.cow_id).toBe(cowId)
    expect(res.body.medications).toHaveLength(1)
    expect(res.body.medications[0].medication_id).toBe(medId)
    expect(res.body.medications[0].dosage).toBe('5ml')
  })

  it('creates a treatment with multiple medications', async () => {
    const cowId = await createCow()
    const med1 = await createMedication()
    const med2 = await createMedication()

    const res = await postTreatment({
      cow_id: cowId,
      medications: [
        { medication_id: med1, dosage: '2ml' },
        { medication_id: med2, dosage: '10ml' },
      ],
      treatment_date: '2026-01-15T10:00:00.000Z',
    })

    expect(res.status).toBe(201)
    expect(res.body.medications).toHaveLength(2)
    const medIds = res.body.medications.map((m) => m.medication_id)
    expect(medIds).toContain(med1)
    expect(medIds).toContain(med2)
    // medication_name should be the comma-joined list
    expect(res.body.medication_name).toContain(',')
  })

  it('persists both medications in the junction table', async () => {
    const cowId = await createCow()
    const med1 = await createMedication()
    const med2 = await createMedication()

    const res = await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: med1 }, { medication_id: med2 }],
      treatment_date: '2026-01-15T10:00:00.000Z',
    })

    const rows = await db('treatment_medications').where({ treatment_id: res.body.id })
    expect(rows).toHaveLength(2)
  })

  it('stores the worst-case (max) withdrawal dates across all medications', async () => {
    const cowId = await createCow()
    // 24h milk withdrawal
    const med1 = await createMedication({ withdrawal_milk_hours: 24, withdrawal_meat_days: 0 })
    // 48h milk withdrawal (worse), 4-day meat withdrawal
    const med2 = await createMedication({ withdrawal_milk_hours: 48, withdrawal_meat_days: 4 })

    const treatmentDate = '2026-01-15T12:00:00.000Z'
    const res = await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: med1 }, { medication_id: med2 }],
      treatment_date: treatmentDate,
    })

    expect(res.status).toBe(201)
    // Max milk: base + 48h = 2026-01-17T12:00:00Z
    expect(res.body.withdrawal_end_milk).toBe('2026-01-17T12:00:00.000Z')
    // Max meat: base + 4 days = 2026-01-19T12:00:00Z
    expect(res.body.withdrawal_end_meat).toBe('2026-01-19T12:00:00.000Z')
  })

  it('stores null withdrawal dates when no medication has withdrawal periods', async () => {
    const cowId = await createCow()
    const medId = await createMedication({ withdrawal_milk_hours: 0, withdrawal_meat_days: 0 })

    const res = await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: medId }],
      treatment_date: '2026-01-15T10:00:00.000Z',
    })

    expect(res.status).toBe(201)
    expect(res.body.withdrawal_end_milk).toBeNull()
    expect(res.body.withdrawal_end_meat).toBeNull()
  })

  it('returns 400 for empty medications array', async () => {
    const cowId = await createCow()
    const res = await postTreatment({
      cow_id: cowId,
      medications: [],
      treatment_date: '2026-01-15T10:00:00.000Z',
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing medications field', async () => {
    const cowId = await createCow()
    const res = await postTreatment({
      cow_id: cowId,
      treatment_date: '2026-01-15T10:00:00.000Z',
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing treatment_date', async () => {
    const cowId = await createCow()
    const medId = await createMedication()
    const res = await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: medId }],
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 for a nonexistent cow', async () => {
    const medId = await createMedication()
    const res = await postTreatment({
      cow_id: randomUUID(),
      medications: [{ medication_id: medId }],
      treatment_date: '2026-01-15T10:00:00.000Z',
    })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/cow/i)
  })

  it('returns 404 for an inactive medication', async () => {
    const cowId = await createCow()
    const medId = await createMedication({ is_active: false })

    const res = await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: medId }],
      treatment_date: '2026-01-15T10:00:00.000Z',
    })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/medication/i)
  })

  it('rolls back the transaction if the second medication insert would fail', async () => {
    // We simulate a failure by passing a nonexistent medication_id as the second item.
    // The first medication is valid, but the second is inactive — the handler should catch
    // this BEFORE inserting and return 404 without leaving any orphaned rows.
    const cowId = await createCow()
    const med1 = await createMedication()
    const fakeMedId = randomUUID()

    const countBefore = (await db('treatments').count('* as n').first()).n

    const res = await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: med1 }, { medication_id: fakeMedId }],
      treatment_date: '2026-01-15T10:00:00.000Z',
    })

    expect(res.status).toBe(404)
    const countAfter = (await db('treatments').count('* as n').first()).n
    expect(countAfter).toBe(countBefore) // no orphaned treatment row
  })
})

// ─── GET /api/treatments ───────────────────────────────────────────────────────

describe('GET /api/treatments', () => {
  it('returns treatments enriched with a medications array', async () => {
    const cowId = await createCow()
    const medId = await createMedication()
    await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: medId, dosage: '3ml' }],
      treatment_date: '2026-01-20T10:00:00.000Z',
    })

    const res = await request(app).get('/api/treatments').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // Every returned treatment should have a medications array
    expect(res.body.every((t) => Array.isArray(t.medications))).toBe(true)
  })

  it('filters by cow_id', async () => {
    const cow1 = await createCow()
    const cow2 = await createCow()
    const medId = await createMedication()
    const date = '2026-01-21T10:00:00.000Z'

    await postTreatment({ cow_id: cow1, medications: [{ medication_id: medId }], treatment_date: date })
    await postTreatment({ cow_id: cow2, medications: [{ medication_id: medId }], treatment_date: date })

    const res = await request(app)
      .get(`/api/treatments?cow_id=${cow1}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.every((t) => t.cow_id === cow1)).toBe(true)
  })
})

// ─── GET /api/treatments/withdrawal ───────────────────────────────────────────

describe('GET /api/treatments/withdrawal', () => {
  it('returns only cows with an active milk withdrawal', async () => {
    const cow = await createCow()
    // Medication with a future milk withdrawal
    const medId = await createMedication({ withdrawal_milk_hours: 999 })
    // Treat 'now' so the withdrawal end is far in the future
    await postTreatment({
      cow_id: cow,
      medications: [{ medication_id: medId }],
      treatment_date: new Date().toISOString(),
    })

    const res = await request(app).get('/api/treatments/withdrawal').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // Every row must have a future milk withdrawal end
    const now = new Date()
    expect(res.body.every((t) => new Date(t.withdrawal_end_milk) > now)).toBe(true)
    expect(res.body.some((t) => t.cow_id === cow)).toBe(true)
  })

  it('returns at most one entry per cow (the latest withdrawal)', async () => {
    const cow = await createCow()
    const med = await createMedication({ withdrawal_milk_hours: 500 })
    const base = new Date()

    // Two treatments for the same cow — the later one has the further withdrawal end
    const earlier = new Date(base.getTime() - 100_000).toISOString()
    const later = new Date(base.getTime() - 1_000).toISOString()
    await postTreatment({ cow_id: cow, medications: [{ medication_id: med }], treatment_date: earlier })
    await postTreatment({ cow_id: cow, medications: [{ medication_id: med }], treatment_date: later })

    const res = await request(app).get('/api/treatments/withdrawal').set('Authorization', adminToken())

    const cowEntries = res.body.filter((t) => t.cow_id === cow)
    expect(cowEntries).toHaveLength(1)
  })
})

// ─── GET /api/treatments/:id ───────────────────────────────────────────────────

describe('GET /api/treatments/:id', () => {
  it('returns a single enriched treatment', async () => {
    const cowId = await createCow()
    const medId = await createMedication({ name: 'DetailMed' })
    const { body: created } = await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: medId, dosage: '7ml' }],
      treatment_date: '2026-02-01T08:00:00.000Z',
      notes: 'test note',
    })

    const res = await request(app)
      .get(`/api/treatments/${created.id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(created.id)
    expect(res.body.notes).toBe('test note')
    expect(res.body.medications[0].medication_name).toBe('DetailMed')
    expect(res.body.medications[0].dosage).toBe('7ml')
  })

  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app)
      .get(`/api/treatments/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/treatments/:id ────────────────────────────────────────────────

describe('DELETE /api/treatments/:id', () => {
  it('deletes the treatment and its junction rows (admin)', async () => {
    const cowId = await createCow()
    const medId = await createMedication()
    const { body: created } = await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: medId }],
      treatment_date: '2026-02-05T10:00:00.000Z',
    })

    const res = await request(app)
      .delete(`/api/treatments/${created.id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)

    // Both the treatment and its junction rows should be gone
    const tx = await db('treatments').where({ id: created.id }).first()
    expect(tx).toBeUndefined()
    const junctionRows = await db('treatment_medications').where({ treatment_id: created.id })
    expect(junctionRows).toHaveLength(0)
  })

  it('returns 403 for a worker token', async () => {
    const cowId = await createCow()
    const medId = await createMedication()
    const { body: created } = await postTreatment({
      cow_id: cowId,
      medications: [{ medication_id: medId }],
      treatment_date: '2026-02-05T10:00:00.000Z',
    })

    const res = await request(app)
      .delete(`/api/treatments/${created.id}`)
      .set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })

  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app)
      .delete(`/api/treatments/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })
})

// ─── Query Validation (12B.8) ───────────────────────────────────────────────

describe('GET /api/treatments query validation', () => {
  it('returns 400 for invalid cow_id', async () => {
    const res = await request(app)
      .get('/api/treatments?cow_id=not-a-uuid')
      .set('Authorization', adminToken())
    expect(res.status).toBe(400)
  })
})

// ─── 13B.4: GET /api/treatments pagination ──────────────────────────────────

describe('GET /api/treatments pagination (13B.4)', () => {
  beforeAll(async () => {
    // Create a fresh cow + medication and 3 treatments to paginate through
    const cowId = await createCow()
    const medId = await createMedication()
    for (let i = 0; i < 3; i++) {
      await postTreatment({
        cow_id: cowId,
        medications: [{ medication_id: medId }],
        treatment_date: `2026-03-0${i + 1}T10:00:00.000Z`,
      })
    }
  })

  it('returns { data, total } when page and limit are provided', async () => {
    const res = await request(app)
      .get('/api/treatments?page=1&limit=2')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('data')
    expect(res.body).toHaveProperty('total')
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeLessThanOrEqual(2)
    expect(typeof res.body.total).toBe('number')
  })

  it('returns plain array when page/limit are omitted (backward compatible)', async () => {
    const res = await request(app)
      .get('/api/treatments')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('paginates: page 2 returns different rows than page 1', async () => {
    const p1 = await request(app)
      .get('/api/treatments?page=1&limit=1')
      .set('Authorization', adminToken())
    const p2 = await request(app)
      .get('/api/treatments?page=2&limit=1')
      .set('Authorization', adminToken())
    expect(p1.body.data[0]?.id).not.toBe(p2.body.data[0]?.id)
  })

  it('returns 400 for invalid sort column', async () => {
    const res = await request(app)
      .get('/api/treatments?page=1&limit=10&sort=invalid_col')
      .set('Authorization', adminToken())
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid order direction', async () => {
    const res = await request(app)
      .get('/api/treatments?page=1&limit=10&order=sideways')
      .set('Authorization', adminToken())
    expect(res.status).toBe(400)
  })
})
