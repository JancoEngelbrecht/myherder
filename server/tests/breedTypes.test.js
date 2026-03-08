const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken, workerToken } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ─── Factory ───────────────────────────────────────────────────────────────────

async function createBreedType(overrides = {}) {
  const id = randomUUID()
  const name = overrides.name || `Breed-${id.slice(0, 6)}`
  const code = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50)
  const now = new Date().toISOString()
  await db('breed_types').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    code,
    name,
    heat_cycle_days: 21,
    gestation_days: 283,
    preg_check_days: 35,
    voluntary_waiting_days: 45,
    dry_off_days: 60,
    calf_max_months: 6,
    heifer_min_months: 15,
    young_bull_min_months: 15,
    is_active: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  })
  return { id, code }
}

// ─── GET /api/breed-types ──────────────────────────────────────────────────────

describe('GET /api/breed-types', () => {
  it('returns only active breed types by default', async () => {
    const { id: activeId } = await createBreedType({ name: `Active-${randomUUID().slice(0, 6)}` })
    const { id: inactiveId } = await createBreedType({
      name: `Inactive-${randomUUID().slice(0, 6)}`,
      is_active: false,
    })

    const res = await request(app).get('/api/breed-types').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const ids = res.body.map((t) => t.id)
    expect(ids).toContain(activeId)
    expect(ids).not.toContain(inactiveId)
  })

  it('returns all including inactive with ?all=1 (admin)', async () => {
    const { id: inactiveId } = await createBreedType({
      name: `AllInactive-${randomUUID().slice(0, 6)}`,
      is_active: false,
    })

    const res = await request(app)
      .get('/api/breed-types?all=1')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.some((t) => t.id === inactiveId)).toBe(true)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/breed-types')
    expect(res.status).toBe(401)
  })
})

// ─── POST /api/breed-types ─────────────────────────────────────────────────────

describe('POST /api/breed-types', () => {
  it('creates with auto-generated code from name', async () => {
    const res = await request(app)
      .post('/api/breed-types')
      .set('Authorization', adminToken())
      .send({ name: 'Holstein Friesian' })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Holstein Friesian')
    expect(res.body.code).toBe('holstein_friesian')
    expect(res.body.id).toBeDefined()
  })

  it('returns 409 for duplicate name (same code)', async () => {
    await createBreedType({ name: 'Duplicate Breed' })

    const res = await request(app)
      .post('/api/breed-types')
      .set('Authorization', adminToken())
      .send({ name: 'Duplicate Breed' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already exists/i)
  })

  it('returns 403 for worker role', async () => {
    const res = await request(app)
      .post('/api/breed-types')
      .set('Authorization', workerToken())
      .send({ name: 'Worker Breed' })

    expect(res.status).toBe(403)
  })
})

// ─── PUT /api/breed-types/:id ──────────────────────────────────────────────────

describe('PUT /api/breed-types/:id', () => {
  it('updates name but code stays immutable', async () => {
    const { id, code } = await createBreedType({ name: `CodeFixed-${randomUUID().slice(0, 6)}` })

    const res = await request(app)
      .put(`/api/breed-types/${id}`)
      .set('Authorization', adminToken())
      .send({ name: 'Totally Different Name' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Totally Different Name')
    // Code should remain unchanged
    const row = await db('breed_types').where({ id }).first()
    expect(row.code).toBe(code)
  })

  it('can update timing fields (gestation_days, etc.)', async () => {
    const { id } = await createBreedType({ name: `Timing-${randomUUID().slice(0, 6)}` })

    const res = await request(app)
      .put(`/api/breed-types/${id}`)
      .set('Authorization', adminToken())
      .send({ name: 'Updated Timing', gestation_days: 290, dry_off_days: 50 })

    expect(res.status).toBe(200)
    expect(res.body.gestation_days).toBe(290)
    expect(res.body.dry_off_days).toBe(50)
  })

  it('returns 404 for nonexistent id', async () => {
    const res = await request(app)
      .put(`/api/breed-types/${randomUUID()}`)
      .set('Authorization', adminToken())
      .send({ name: 'Ghost' })

    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/breed-types/:id ──────────────────────────────────────────────

describe('DELETE /api/breed-types/:id', () => {
  it('deletes a breed type with no cows referencing it', async () => {
    const { id } = await createBreedType({ name: `DeleteMe-${randomUUID().slice(0, 6)}` })

    const res = await request(app)
      .delete(`/api/breed-types/${id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const row = await db('breed_types').where({ id }).first()
    expect(row).toBeUndefined()
  })

  it('returns 409 when cows reference this breed type', async () => {
    const { id: breedId } = await createBreedType({ name: `InUse-${randomUUID().slice(0, 6)}` })

    // Create a cow referencing this breed
    const cowId = randomUUID()
    await db('cows').insert({
      id: cowId,
      farm_id: DEFAULT_FARM_ID,
      tag_number: `BT-${cowId.slice(0, 6)}`,
      sex: 'female',
      status: 'active',
      breed_type_id: breedId,
    })

    const res = await request(app)
      .delete(`/api/breed-types/${breedId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/cannot delete/i)
  })

  it('returns 403 for worker role', async () => {
    const { id } = await createBreedType({ name: `WorkerDel-${randomUUID().slice(0, 6)}` })

    const res = await request(app)
      .delete(`/api/breed-types/${id}`)
      .set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })
})
