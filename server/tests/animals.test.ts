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

// Helper — inserts an animal row and returns its id
async function createAnimal(overrides = {}) {
  const id = randomUUID()
  await db('animals').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    tag_number: `TAG-${id.slice(0, 8)}`,
    name: 'Test Cow',
    sex: 'female',
    status: 'active',
    ...overrides,
  })
  return id
}

// ─── GET /api/animals ─────────────────────────────────────────────────────────

describe('GET /api/animals', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/animals')
    expect(res.status).toBe(401)
  })

  it('returns a plain array of animals', async () => {
    const res = await request(app).get('/api/animals').set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('filters by search query (tag and name)', async () => {
    const tag = `SRCH-${randomUUID().slice(0, 6)}`
    await createAnimal({ tag_number: tag, name: 'Searchable' })

    const res = await request(app)
      .get(`/api/animals?search=${tag}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.some((c) => c.tag_number === tag)).toBe(true)
  })

  it('filters by status', async () => {
    await createAnimal({ tag_number: `SICK-${randomUUID().slice(0, 6)}`, status: 'sick' })

    const res = await request(app)
      .get('/api/animals?status=sick')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.every((c) => c.status === 'sick')).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('respects pagination (limit + page)', async () => {
    // Insert enough animals so there is more than 1 page worth
    for (let i = 0; i < 3; i++) {
      await createAnimal({ tag_number: `PAGE-${randomUUID().slice(0, 6)}` })
    }

    const res = await request(app)
      .get('/api/animals?limit=2&page=1')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(2)
  })
})

// ─── GET /api/animals/:id ─────────────────────────────────────────────────────

describe('GET /api/animals/:id', () => {
  it('returns a single animal with sire_name and dam_name', async () => {
    const sireId = await createAnimal({
      tag_number: `SIRE-${randomUUID().slice(0, 6)}`,
      sex: 'male',
      name: 'Big Bull',
    })
    const animalId = await createAnimal({
      tag_number: `CALF-${randomUUID().slice(0, 6)}`,
      sire_id: sireId,
    })

    const res = await request(app)
      .get(`/api/animals/${animalId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(animalId)
    expect(res.body.sire_name).toBe('Big Bull')
    expect(res.body.dam_name).toBeNull()
  })

  it('returns 404 for a nonexistent animal', async () => {
    const res = await request(app)
      .get(`/api/animals/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })
})

// ─── POST /api/animals ────────────────────────────────────────────────────────

describe('POST /api/animals', () => {
  it('creates an animal and returns 201', async () => {
    const tag = `NEW-${randomUUID().slice(0, 6)}`
    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: tag, name: 'Bessie', sex: 'female', status: 'active' })

    expect(res.status).toBe(201)
    expect(res.body.tag_number).toBe(tag)
    expect(res.body.id).toBeDefined()
  })

  it('returns 409 when tag_number is a duplicate', async () => {
    const tag = `DUP-${randomUUID().slice(0, 6)}`
    await createAnimal({ tag_number: tag })

    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: tag })

    expect(res.status).toBe(409)
  })

  it('returns 400 for missing tag_number', async () => {
    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ name: 'No Tag' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: `BAD-${randomUUID().slice(0, 6)}`, status: 'unicorn' })

    expect(res.status).toBe(400)
  })

  it('returns 403 for a worker without can_manage_animals permission', async () => {
    // Inline worker token with no permissions (must use real user ID for token_version check)
    const jwt = require('jsonwebtoken')
    const { jwtSecret } = require('../config/env')
    const { WORKER_ID, DEFAULT_FARM_ID } = require('./helpers/setup')
    const noPermToken = `Bearer ${jwt.sign(
      {
        id: WORKER_ID,
        farm_id: DEFAULT_FARM_ID,
        role: 'worker',
        permissions: [],
        token_version: 0,
      },
      jwtSecret,
      { expiresIn: '1h' }
    )}`

    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', noPermToken)
      .send({ tag_number: `DENY-${randomUUID().slice(0, 6)}` })

    expect(res.status).toBe(403)
  })
})

// ─── PUT /api/animals/:id ─────────────────────────────────────────────────────

describe('PUT /api/animals/:id', () => {
  it('updates the animal and returns 200', async () => {
    const id = await createAnimal({
      tag_number: `UPD-${randomUUID().slice(0, 6)}`,
      name: 'Old Name',
    })

    const res = await request(app)
      .put(`/api/animals/${id}`)
      .set('Authorization', adminToken())
      .send({ name: 'New Name', status: 'dry' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New Name')
    expect(res.body.status).toBe('dry')
  })

  it('returns 404 for a nonexistent animal', async () => {
    const res = await request(app)
      .put(`/api/animals/${randomUUID()}`)
      .set('Authorization', adminToken())
      .send({ name: 'Ghost' })

    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/animals/:id ──────────────────────────────────────────────────

describe('DELETE /api/animals/:id', () => {
  it('soft-deletes the animal (admin)', async () => {
    const id = await createAnimal({ tag_number: `DEL-${randomUUID().slice(0, 6)}` })

    const res = await request(app).delete(`/api/animals/${id}`).set('Authorization', adminToken())

    expect(res.status).toBe(200)

    // Should no longer appear in listings
    const listRes = await request(app).get('/api/animals').set('Authorization', adminToken())
    expect(listRes.body.find((c) => c.id === id)).toBeUndefined()

    // tag_number must be renamed so the slot is freed for re-use
    const dbRow = await db('animals').where({ id }).first()
    expect(dbRow.tag_number).toContain('__del_')
    expect(dbRow.deleted_at).not.toBeNull()
  })

  it('returns 403 for a worker token', async () => {
    const id = await createAnimal({ tag_number: `WDEL-${randomUUID().slice(0, 6)}` })

    const res = await request(app).delete(`/api/animals/${id}`).set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })
})

// ─── Species-aware animal tests ───────────────────────────────────────────────

describe('POST /api/animals — species_id auto-set from breed_type', () => {
  it('auto-sets species_id from breed_type_id on create', async () => {
    const cattle = await db('species').where({ code: 'cattle' }).first()
    const btId = randomUUID()
    const now = new Date().toISOString()
    await db('breed_types').insert({
      id: btId,
      farm_id: DEFAULT_FARM_ID,
      code: `auto_sp_${btId.slice(0, 6)}`,
      name: `AutoSp-${btId.slice(0, 6)}`,
      species_id: cattle.id,
      is_active: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    })

    const tag = `SPTEST-${randomUUID().slice(0, 6)}`
    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: tag, sex: 'female', breed_type_id: btId })

    expect(res.status).toBe(201)
    const row = await db('animals').where({ id: res.body.id }).first()
    expect(row.species_id).toBe(cattle.id)
  })

  it('accepts birth_event_id linking an offspring to a birth event', async () => {
    const animalId = await createAnimal({ tag_number: `DAM-${randomUUID().slice(0, 6)}` })
    const birthEventId = randomUUID()
    const now = new Date().toISOString()
    await db('breeding_events').insert({
      id: birthEventId,
      farm_id: DEFAULT_FARM_ID,
      animal_id: animalId,
      event_type: 'calving',
      event_date: '2026-01-15T08:00',
      offspring_count: 1,
      recorded_by: (await db('users').where('farm_id', DEFAULT_FARM_ID).first()).id,
      created_at: now,
      updated_at: now,
    })

    const tag = `OFFSPRING-${randomUUID().slice(0, 6)}`
    const res = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: tag, sex: 'female', birth_event_id: birthEventId })

    expect(res.status).toBe(201)
    const row = await db('animals').where({ id: res.body.id }).first()
    expect(row.birth_event_id).toBe(birthEventId)
  })
})

describe('GET /api/animals — species filter', () => {
  it('filters animals by species_id', async () => {
    const cattle = await db('species').where({ code: 'cattle' }).first()
    const sheep = await db('species').where({ code: 'sheep' }).first()

    const cattleAnimalId = await createAnimal({
      tag_number: `CATTLESP-${randomUUID().slice(0, 6)}`,
      species_id: cattle.id,
    })
    const sheepAnimalId = await createAnimal({
      tag_number: `SHEEPSP-${randomUUID().slice(0, 6)}`,
      species_id: sheep.id,
    })

    const res = await request(app)
      .get(`/api/animals?species_id=${cattle.id}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const ids = res.body.map((c) => c.id)
    expect(ids).toContain(cattleAnimalId)
    expect(ids).not.toContain(sheepAnimalId)
  })

  it('filters offspring by birth_event_id', async () => {
    const damId = await createAnimal({ tag_number: `DAM2-${randomUUID().slice(0, 6)}` })
    const evId = randomUUID()
    const now = new Date().toISOString()
    await db('breeding_events').insert({
      id: evId,
      farm_id: DEFAULT_FARM_ID,
      animal_id: damId,
      event_type: 'calving',
      event_date: '2026-02-01T08:00',
      offspring_count: 2,
      recorded_by: (await db('users').where('farm_id', DEFAULT_FARM_ID).first()).id,
      created_at: now,
      updated_at: now,
    })

    const offspring1 = await createAnimal({
      tag_number: `OFF1-${randomUUID().slice(0, 6)}`,
      birth_event_id: evId,
    })
    const unrelated = await createAnimal({
      tag_number: `UNREL-${randomUUID().slice(0, 6)}`,
    })

    const res = await request(app)
      .get(`/api/animals?birth_event_id=${evId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const ids = res.body.map((c) => c.id)
    expect(ids).toContain(offspring1)
    expect(ids).not.toContain(unrelated)
  })
})

describe('PUT /api/animals/:id — species_id sync on breed_type change', () => {
  it('updates species_id when breed_type_id changes', async () => {
    const cattle = await db('species').where({ code: 'cattle' }).first()
    const sheep = await db('species').where({ code: 'sheep' }).first()
    const now = new Date().toISOString()

    const sheepBtId = randomUUID()
    await db('breed_types').insert({
      id: sheepBtId,
      farm_id: DEFAULT_FARM_ID,
      code: `sheep_bt_${sheepBtId.slice(0, 6)}`,
      name: `SheepBt-${sheepBtId.slice(0, 6)}`,
      species_id: sheep.id,
      is_active: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    })

    const animalId = await createAnimal({
      tag_number: `CHNGSP-${randomUUID().slice(0, 6)}`,
      species_id: cattle.id,
    })

    const res = await request(app)
      .put(`/api/animals/${animalId}`)
      .set('Authorization', adminToken())
      .send({ name: 'Updated', breed_type_id: sheepBtId })

    expect(res.status).toBe(200)
    const row = await db('animals').where({ id: animalId }).first()
    expect(row.species_id).toBe(sheep.id)
  })
})

// ─── POST /api/animals/batch ──────────────────────────────────────────────────

describe('POST /api/animals/batch', () => {
  it('creates 10 animals, returns 201 with correct count and animals array', async () => {
    const tags = Array.from({ length: 10 }, (_, i) => `BATCH-${randomUUID().slice(0, 6)}-${i}`)

    const res = await request(app)
      .post('/api/animals/batch')
      .set('Authorization', adminToken())
      .send({
        defaults: { sex: 'female', status: 'active' },
        tags,
      })

    expect(res.status).toBe(201)
    expect(res.body.created).toBe(10)
    expect(Array.isArray(res.body.animals)).toBe(true)
    expect(res.body.animals).toHaveLength(10)

    // Verify rows exist in DB
    const dbRows = await db('animals').whereIn('tag_number', tags).whereNull('deleted_at')
    expect(dbRows).toHaveLength(10)
  })

  it('writes N audit log entries after batch create', async () => {
    const tags = Array.from({ length: 3 }, (_, i) => `AUDIT-${randomUUID().slice(0, 6)}-${i}`)

    const res = await request(app)
      .post('/api/animals/batch')
      .set('Authorization', adminToken())
      .send({
        defaults: { sex: 'male', status: 'active' },
        tags,
      })

    expect(res.status).toBe(201)

    const createdIds = res.body.animals.map((a) => a.id)
    const auditRows = await db('audit_log')
      .whereIn('entity_id', createdIds)
      .where('action', 'create')
      .where('entity_type', 'animal')

    expect(auditRows).toHaveLength(3)
  })

  it('returns 400 when tags array contains duplicates within the batch', async () => {
    const tag = `DUP-BATCH-${randomUUID().slice(0, 6)}`

    const res = await request(app)
      .post('/api/animals/batch')
      .set('Authorization', adminToken())
      .send({
        defaults: { sex: 'female', status: 'active' },
        tags: [tag, tag],
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('DUPLICATE_TAGS')
    expect(res.body.error.details).toContain(tag)
  })

  it('returns 409 when tags already exist in the farm', async () => {
    const existingTag = `EXIST-${randomUUID().slice(0, 6)}`
    await createAnimal({ tag_number: existingTag })

    const newTag = `NEW-${randomUUID().slice(0, 6)}`

    const res = await request(app)
      .post('/api/animals/batch')
      .set('Authorization', adminToken())
      .send({
        defaults: { sex: 'female', status: 'active' },
        tags: [existingTag, newTag],
      })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('TAGS_EXIST')
    expect(res.body.error.details).toContain(existingTag)
    expect(res.body.error.details).not.toContain(newTag)
  })

  it('returns 400 when a tag item in the array is invalid (null)', async () => {
    const res = await request(app)
      .post('/api/animals/batch')
      .set('Authorization', adminToken())
      .send({
        defaults: { sex: 'female', status: 'active' },
        tags: [null],
      })

    expect(res.status).toBe(400)
  })

  it('returns 400 when tags array exceeds 500 items', async () => {
    const tags = Array.from({ length: 501 }, (_, i) => `OVER-${i}`)

    const res = await request(app)
      .post('/api/animals/batch')
      .set('Authorization', adminToken())
      .send({
        defaults: { sex: 'female', status: 'active' },
        tags,
      })

    expect(res.status).toBe(400)
  })

  it('returns 400 when required defaults.sex is missing', async () => {
    const res = await request(app)
      .post('/api/animals/batch')
      .set('Authorization', adminToken())
      .send({
        defaults: { status: 'active' },
        tags: [`NOSEX-${randomUUID().slice(0, 6)}`],
      })

    expect(res.status).toBe(400)
  })

  it('returns 403 for a worker with can_manage_animals (batch-delete only blocks workers, batch create allows)', async () => {
    // Workers with can_manage_animals are allowed to batch-create
    const tags = [`WBATCH-${randomUUID().slice(0, 6)}`]

    const res = await request(app)
      .post('/api/animals/batch')
      .set('Authorization', workerToken())
      .send({
        defaults: { sex: 'female', status: 'active' },
        tags,
      })

    // workerToken() has can_manage_animals, so this should succeed
    expect(res.status).toBe(201)
  })
})

// ─── POST /api/animals/batch-delete ──────────────────────────────────────────

describe('POST /api/animals/batch-delete', () => {
  it('soft-deletes multiple animals and returns deleted count', async () => {
    const ids = await Promise.all([
      createAnimal({ tag_number: `BDEL1-${randomUUID().slice(0, 6)}` }),
      createAnimal({ tag_number: `BDEL2-${randomUUID().slice(0, 6)}` }),
      createAnimal({ tag_number: `BDEL3-${randomUUID().slice(0, 6)}` }),
    ])

    const res = await request(app)
      .post('/api/animals/batch-delete')
      .set('Authorization', adminToken())
      .send({ ids })

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(3)

    // Verify soft-delete applied
    const dbRows = await db('animals').whereIn('id', ids).whereNull('deleted_at')
    expect(dbRows).toHaveLength(0)

    const deletedRows = await db('animals').whereIn('id', ids).whereNotNull('deleted_at')
    expect(deletedRows).toHaveLength(3)

    // Every deleted row must have its tag_number renamed
    expect(deletedRows.every((r) => r.tag_number.includes('__del_'))).toBe(true)
  })

  it('writes N audit log entries after batch delete', async () => {
    const ids = await Promise.all([
      createAnimal({ tag_number: `AUDDEL1-${randomUUID().slice(0, 6)}` }),
      createAnimal({ tag_number: `AUDDEL2-${randomUUID().slice(0, 6)}` }),
    ])

    const res = await request(app)
      .post('/api/animals/batch-delete')
      .set('Authorization', adminToken())
      .send({ ids })

    expect(res.status).toBe(200)

    const auditRows = await db('audit_log')
      .whereIn('entity_id', ids)
      .where('action', 'delete')
      .where('entity_type', 'animal')

    expect(auditRows).toHaveLength(2)
  })

  it('returns 403 for a worker token (admin-only endpoint)', async () => {
    const id = await createAnimal({ tag_number: `WBDEL-${randomUUID().slice(0, 6)}` })

    const res = await request(app)
      .post('/api/animals/batch-delete')
      .set('Authorization', workerToken())
      .send({ ids: [id] })

    expect(res.status).toBe(403)
  })

  it('returns 404 when any ID belongs to a different farm', async () => {
    const otherFarmId = randomUUID()
    await db('farms').insert({
      id: otherFarmId,
      name: 'Other Farm',
      code: 'OTH',
      slug: 'other',
      is_active: true,
    })

    const crossFarmAnimalId = randomUUID()
    await db('animals').insert({
      id: crossFarmAnimalId,
      farm_id: otherFarmId,
      tag_number: `XFARM-${randomUUID().slice(0, 6)}`,
      sex: 'female',
      status: 'active',
    })

    const res = await request(app)
      .post('/api/animals/batch-delete')
      .set('Authorization', adminToken())
      .send({ ids: [crossFarmAnimalId] })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('ANIMALS_NOT_FOUND')
  })

  it('returns 400 when ids array is empty', async () => {
    const res = await request(app)
      .post('/api/animals/batch-delete')
      .set('Authorization', adminToken())
      .send({ ids: [] })

    expect(res.status).toBe(400)
  })

  it('returns 400 when ids contains a non-UUID value', async () => {
    const res = await request(app)
      .post('/api/animals/batch-delete')
      .set('Authorization', adminToken())
      .send({ ids: ['not-a-uuid'] })

    expect(res.status).toBe(400)
  })

  it('returns 404 for a non-existent ID', async () => {
    const res = await request(app)
      .post('/api/animals/batch-delete')
      .set('Authorization', adminToken())
      .send({ ids: [randomUUID()] })

    expect(res.status).toBe(404)
  })
})

// ─── Tag re-use after delete ──────────────────────────────────────────────────

describe('Tag re-use after delete', () => {
  it('single: re-creates same tag after delete (201)', async () => {
    const tag = `REUSE-${randomUUID().slice(0, 6)}`
    const id = await createAnimal({ tag_number: tag })

    // Delete
    const delRes = await request(app)
      .delete(`/api/animals/${id}`)
      .set('Authorization', adminToken())
    expect(delRes.status).toBe(200)

    // DB row has renamed tag
    const dbRow = await db('animals').where({ id }).first()
    expect(dbRow.tag_number).toContain('__del_')

    // Re-create with same tag must succeed
    const createRes = await request(app)
      .post('/api/animals')
      .set('Authorization', adminToken())
      .send({ tag_number: tag, sex: 'female', status: 'active' })
    expect(createRes.status).toBe(201)
    expect(createRes.body.tag_number).toBe(tag)
  })

  it('batch: re-creates same tags after batch delete (201)', async () => {
    const tags = [
      `BREUSE-${randomUUID().slice(0, 6)}`,
      `BREUSE-${randomUUID().slice(0, 6)}`,
      `BREUSE-${randomUUID().slice(0, 6)}`,
    ]
    const ids = await Promise.all(tags.map((tag_number) => createAnimal({ tag_number })))

    // Batch delete
    const delRes = await request(app)
      .post('/api/animals/batch-delete')
      .set('Authorization', adminToken())
      .send({ ids })
    expect(delRes.status).toBe(200)
    expect(delRes.body.deleted).toBe(3)

    // Batch re-create with same tags must succeed
    const createRes = await request(app)
      .post('/api/animals/batch')
      .set('Authorization', adminToken())
      .send({
        defaults: { sex: 'female', status: 'active' },
        tags,
      })
    expect(createRes.status).toBe(201)
    expect(createRes.body.created).toBe(3)
  })

  it('double delete: two distinct __del_ suffixes, no UNIQUE violation', async () => {
    const tag = `DDEL-${randomUUID().slice(0, 6)}`

    // First create + delete
    const id1 = await createAnimal({ tag_number: tag })
    const del1 = await request(app).delete(`/api/animals/${id1}`).set('Authorization', adminToken())
    expect(del1.status).toBe(200)

    // Second create + delete (same tag)
    const id2 = await createAnimal({ tag_number: tag })
    const del2 = await request(app).delete(`/api/animals/${id2}`).set('Authorization', adminToken())
    expect(del2.status).toBe(200)

    // Both rows have __del_ in tag_number
    const rows = await db('animals')
      .whereRaw('tag_number LIKE ?', ['%__del_%'])
      .whereIn('id', [id1, id2])
    expect(rows).toHaveLength(2)

    // Suffixes must be distinct (no collision)
    const [tag1, tag2] = rows.map((r) => r.tag_number)
    expect(tag1).not.toBe(tag2)

    // Suffix format: <original>__del_<13-digit-ms>_<8-hex-chars>
    // eslint-disable-next-line security/detect-non-literal-regexp -- test-local tag is regex-safe
    const pattern = new RegExp(`^${tag}__del_\\d{13}_[0-9a-f]{8}$`)
    expect(tag1).toMatch(pattern)
    expect(tag2).toMatch(pattern)
  })
})

// ─── Query Validation (12B.4) ─────────────────────────────────────────────────

describe('GET /api/animals query validation', () => {
  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .get('/api/animals?status=invalid')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })

  it('returns 400 for unknown query param', async () => {
    const res = await request(app)
      .get('/api/animals?nonexistent=1')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })
})
