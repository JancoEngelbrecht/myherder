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

async function createType(overrides = {}) {
  const id = randomUUID()
  const name = overrides.name || `TestType-${id.slice(0, 6)}`
  const code = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50)
  const now = new Date().toISOString()
  await db('issue_type_definitions').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    code,
    name,
    emoji: '🐄',
    requires_teat_selection: false,
    is_active: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
    // Re-derive code if name was overridden via overrides
  })
  return { id, code }
}

// ─── GET /api/issue-types ──────────────────────────────────────────────────────

describe('GET /api/issue-types', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/issue-types')
    expect(res.status).toBe(401)
  })

  it('returns only active types by default', async () => {
    const { id: activeId } = await createType({ name: `Active-${randomUUID().slice(0, 6)}` })
    const { id: inactiveId } = await createType({
      name: `Inactive-${randomUUID().slice(0, 6)}`,
      is_active: false,
    })

    const res = await request(app).get('/api/issue-types').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const ids = res.body.map((t) => t.id)
    expect(ids).toContain(activeId)
    expect(ids).not.toContain(inactiveId)
  })

  it('returns all types (including inactive) with ?all=1', async () => {
    const { id: inactiveId } = await createType({
      name: `AllInactive-${randomUUID().slice(0, 6)}`,
      is_active: false,
    })

    const res = await request(app)
      .get('/api/issue-types?all=1')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.some((t) => t.id === inactiveId)).toBe(true)
  })

  it('sets X-Total-Count header', async () => {
    const res = await request(app).get('/api/issue-types').set('Authorization', adminToken())
    expect(res.headers['x-total-count']).toBeDefined()
  })

  it('paginates when page param is provided', async () => {
    // Create enough types to paginate
    for (let i = 0; i < 3; i++) {
      await createType({ name: `PagType-${randomUUID().slice(0, 6)}` })
    }

    const res = await request(app)
      .get('/api/issue-types?page=1&limit=2')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(2)
    expect(Number(res.headers['x-total-count'])).toBeGreaterThanOrEqual(3)
  })
})

// ─── POST /api/issue-types ─────────────────────────────────────────────────────

describe('POST /api/issue-types', () => {
  it('creates an issue type and returns 201', async () => {
    const res = await request(app)
      .post('/api/issue-types')
      .set('Authorization', adminToken())
      .send({ name: 'Foot Rot', emoji: '🦶', requires_teat_selection: false })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Foot Rot')
    expect(res.body.code).toBe('foot_rot')
    expect(res.body.id).toBeDefined()
    expect(res.body.is_active).toBe(1) // SQLite stores booleans as 0/1
  })

  it('auto-generates a url-safe code from the name', async () => {
    const res = await request(app)
      .post('/api/issue-types')
      .set('Authorization', adminToken())
      .send({ name: 'Pink Eye & Infection!', emoji: '👁️' })

    expect(res.status).toBe(201)
    expect(res.body.code).toBe('pink_eye_infection')
  })

  it('returns 409 when the derived code already exists', async () => {
    await createType({ name: 'Duplicate Issue' })

    // Same name → same code → conflict
    const res = await request(app)
      .post('/api/issue-types')
      .set('Authorization', adminToken())
      .send({ name: 'Duplicate Issue', emoji: '⚠️' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already exists/i)
  })

  it('returns 400 for missing name', async () => {
    const res = await request(app)
      .post('/api/issue-types')
      .set('Authorization', adminToken())
      .send({ emoji: '🩺' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for missing emoji', async () => {
    const res = await request(app)
      .post('/api/issue-types')
      .set('Authorization', adminToken())
      .send({ name: 'No Emoji Type' })

    expect(res.status).toBe(400)
  })

  it('returns 403 for a worker token', async () => {
    const res = await request(app)
      .post('/api/issue-types')
      .set('Authorization', workerToken())
      .send({ name: 'Worker Type', emoji: '🐄' })

    expect(res.status).toBe(403)
  })
})

// ─── PUT /api/issue-types/:id ──────────────────────────────────────────────────

describe('PUT /api/issue-types/:id', () => {
  it('updates the type name and emoji', async () => {
    const { id } = await createType({ name: `UpdateMe-${randomUUID().slice(0, 6)}` })

    const res = await request(app)
      .put(`/api/issue-types/${id}`)
      .set('Authorization', adminToken())
      .send({ name: 'Updated Name', emoji: '🔴', requires_teat_selection: true })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated Name')
    expect(res.body.emoji).toBe('🔴')
  })

  it('does not change the code when name is updated', async () => {
    const { id, code } = await createType({ name: `CodeFixed-${randomUUID().slice(0, 6)}` })

    await request(app)
      .put(`/api/issue-types/${id}`)
      .set('Authorization', adminToken())
      .send({ name: 'Totally Different Name', emoji: '🩺' })

    const row = await db('issue_type_definitions').where({ id }).first()
    expect(row.code).toBe(code) // code is immutable
  })

  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app)
      .put(`/api/issue-types/${randomUUID()}`)
      .set('Authorization', adminToken())
      .send({ name: 'Ghost', emoji: '👻' })

    expect(res.status).toBe(404)
  })

  it('returns 403 for a worker token', async () => {
    const { id } = await createType({ name: `WorkerPut-${randomUUID().slice(0, 6)}` })

    const res = await request(app)
      .put(`/api/issue-types/${id}`)
      .set('Authorization', workerToken())
      .send({ name: 'Worker Update', emoji: '🐄' })

    expect(res.status).toBe(403)
  })
})

// ─── DELETE /api/issue-types/:id ──────────────────────────────────────────────

describe('DELETE /api/issue-types/:id', () => {
  it('deletes an unused issue type', async () => {
    const { id } = await createType({ name: `DeleteMe-${randomUUID().slice(0, 6)}` })

    const res = await request(app)
      .delete(`/api/issue-types/${id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const row = await db('issue_type_definitions').where({ id }).first()
    expect(row).toBeUndefined()
  })

  it('returns 409 when the type is referenced in health_issues', async () => {
    const { id, code } = await createType({ name: `InUse-${randomUUID().slice(0, 6)}` })

    // Create a cow and a health issue that references this code
    const cowId = randomUUID()
    await db('cows').insert({ id: cowId, farm_id: DEFAULT_FARM_ID, tag_number: `IT-${cowId.slice(0, 6)}`, sex: 'female', status: 'active' })
    const adminId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const now = new Date().toISOString()
    await db('health_issues').insert({
      id: randomUUID(),
      farm_id: DEFAULT_FARM_ID,
      cow_id: cowId,
      reported_by: adminId,
      issue_types: JSON.stringify([code]),
      severity: 'low',
      observed_at: now,
      status: 'open',
      created_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .delete(`/api/issue-types/${id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/cannot delete/i)
  })

  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app)
      .delete(`/api/issue-types/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })

  it('returns 403 for a worker token', async () => {
    const { id } = await createType({ name: `WorkerDel-${randomUUID().slice(0, 6)}` })

    const res = await request(app)
      .delete(`/api/issue-types/${id}`)
      .set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })
})

// ─── Query Validation (12B.8) ───────────────────────────────────────────────

describe('GET /api/issue-types query validation', () => {
  it('returns 400 for unknown query param', async () => {
    const res = await request(app)
      .get('/api/issue-types?bogus=1')
      .set('Authorization', adminToken())
    expect(res.status).toBe(400)
  })
})
