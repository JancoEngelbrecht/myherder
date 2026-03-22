const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers } = require('./helpers/setup')
const { adminToken } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ─── GET /api/species ──────────────────────────────────────────────────────────

describe('GET /api/species', () => {
  it('returns active species without authentication', async () => {
    const res = await request(app).get('/api/species')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns cattle and sheep species', async () => {
    const res = await request(app).get('/api/species')

    expect(res.status).toBe(200)
    const codes = res.body.map((s) => s.code)
    expect(codes).toContain('cattle')
    expect(codes).toContain('sheep')
  })

  it('returns species with parsed config (not a string)', async () => {
    const res = await request(app).get('/api/species')

    expect(res.status).toBe(200)
    const cattle = res.body.find((s) => s.code === 'cattle')
    expect(cattle).toBeDefined()
    expect(typeof cattle.config).toBe('object')
    expect(cattle.config).not.toBeNull()
  })

  it('cattle config has correct terminology', async () => {
    const res = await request(app).get('/api/species')

    const cattle = res.body.find((s) => s.code === 'cattle')
    expect(cattle.config.terminology.singular).toBe('Cow')
    expect(cattle.config.terminology.maleSingular).toBe('Bull')
    expect(cattle.config.terminology.collectiveNoun).toBe('Herd')
    expect(cattle.config.terminology.birthEvent).toBe('Calving')
  })

  it('sheep config has correct terminology', async () => {
    const res = await request(app).get('/api/species')

    const sheep = res.body.find((s) => s.code === 'sheep')
    expect(sheep.config.terminology.femaleSingular).toBe('Ewe')
    expect(sheep.config.terminology.maleSingular).toBe('Ram')
    expect(sheep.config.terminology.collectiveNoun).toBe('Flock')
    expect(sheep.config.terminology.birthEvent).toBe('Lambing')
  })

  it('cattle config includes life_phases for both sexes', async () => {
    const res = await request(app).get('/api/species')

    const cattle = res.body.find((s) => s.code === 'cattle')
    expect(Array.isArray(cattle.config.life_phases.female)).toBe(true)
    expect(Array.isArray(cattle.config.life_phases.male)).toBe(true)
    expect(cattle.config.life_phases.female.some((p) => p.code === 'heifer')).toBe(true)
    expect(cattle.config.life_phases.male.some((p) => p.code === 'bull')).toBe(true)
  })

  it('sheep config includes life_phases with lamb/ewe/ram phases', async () => {
    const res = await request(app).get('/api/species')

    const sheep = res.body.find((s) => s.code === 'sheep')
    expect(sheep.config.life_phases.female.some((p) => p.code === 'lamb')).toBe(true)
    expect(sheep.config.life_phases.female.some((p) => p.code === 'ewe')).toBe(true)
    expect(sheep.config.life_phases.male.some((p) => p.code === 'ram')).toBe(true)
  })

  it('cattle config includes calving in event_types but not lambing', async () => {
    const res = await request(app).get('/api/species')

    const cattle = res.body.find((s) => s.code === 'cattle')
    expect(cattle.config.event_types).toContain('calving')
    expect(cattle.config.event_types).not.toContain('lambing')
    expect(cattle.config.event_types).not.toContain('ram_service')
  })

  it('sheep config includes lambing in event_types but not calving or dry_off', async () => {
    const res = await request(app).get('/api/species')

    const sheep = res.body.find((s) => s.code === 'sheep')
    expect(sheep.config.event_types).toContain('lambing')
    expect(sheep.config.event_types).toContain('ram_service')
    expect(sheep.config.event_types).not.toContain('calving')
    expect(sheep.config.event_types).not.toContain('dry_off')
  })

  it('returns emoji for each species', async () => {
    const res = await request(app).get('/api/species')

    const cattle = res.body.find((s) => s.code === 'cattle')
    const sheep = res.body.find((s) => s.code === 'sheep')
    expect(cattle.config.emoji.female).toBe('🐄')
    expect(sheep.config.emoji.female).toBe('🐑')
    expect(sheep.config.emoji.male).toBe('🐏')
  })

  it('only returns active species', async () => {
    // Deactivate cattle temporarily
    await db('species').where({ code: 'cattle' }).update({ is_active: false })

    const res = await request(app).get('/api/species')

    const codes = res.body.map((s) => s.code)
    expect(codes).not.toContain('cattle')

    // Restore
    await db('species').where({ code: 'cattle' }).update({ is_active: true })
  })
})

// ─── GET /api/species/:id ─────────────────────────────────────────────────────

describe('GET /api/species/:id', () => {
  it('returns a single species by ID with parsed config', async () => {
    const [cattle] = await db('species').where({ code: 'cattle' }).select('id')

    const res = await request(app).get(`/api/species/${cattle.id}`)

    expect(res.status).toBe(200)
    expect(res.body.code).toBe('cattle')
    expect(typeof res.body.config).toBe('object')
    expect(res.body.config.terminology.singular).toBe('Cow')
  })

  it('returns 404 for non-existent species', async () => {
    const res = await request(app).get('/api/species/00000000-0000-0000-0000-000000000000')

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })

  it('returns sheep by ID with correct terminology', async () => {
    const [sheep] = await db('species').where({ code: 'sheep' }).select('id')

    const res = await request(app).get(`/api/species/${sheep.id}`)

    expect(res.status).toBe(200)
    expect(res.body.config.terminology.collectiveNoun).toBe('Flock')
  })

  it('works without authentication (public endpoint)', async () => {
    const [cattle] = await db('species').where({ code: 'cattle' }).select('id')
    const res = await request(app).get(`/api/species/${cattle.id}`)
    expect(res.status).toBe(200)
  })

  it('also works with authentication', async () => {
    const [cattle] = await db('species').where({ code: 'cattle' }).select('id')
    const res = await request(app)
      .get(`/api/species/${cattle.id}`)
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
  })
})
