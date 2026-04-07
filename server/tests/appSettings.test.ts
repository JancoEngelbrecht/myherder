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

// ─── GET /api/settings ──────────────────────────────────────────────────────

describe('GET /api/settings', () => {
  it('returns empty object without auth and no farm_code', async () => {
    const res = await request(app).get('/api/settings')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({})
  })

  it('returns settings with farm_code query param (login page)', async () => {
    const res = await request(app).get('/api/settings?farm_code=TEST')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('farm_name')
    expect(res.body).toHaveProperty('default_language')
  })

  it('returns settings as key-value object with auth', async () => {
    const res = await request(app).get('/api/settings').set('Authorization', adminToken())
    expect(typeof res.body.farm_name).toBe('string')
    expect(typeof res.body.default_language).toBe('string')
  })
})

// ─── PATCH /api/settings ────────────────────────────────────────────────────

describe('PATCH /api/settings', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).patch('/api/settings').send({ farm_name: 'Test Farm' })
    expect(res.status).toBe(401)
  })

  it('returns 403 for a worker token', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', workerToken())
      .send({ farm_name: 'Test Farm' })
    expect(res.status).toBe(403)
  })

  it('updates farm_name as admin', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', adminToken())
      .send({ farm_name: 'Green Pastures' })

    expect(res.status).toBe(200)
    expect(res.body.farm_name).toBe('Green Pastures')
  })

  it('updates default_language as admin', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', adminToken())
      .send({ default_language: 'af' })

    expect(res.status).toBe(200)
    expect(res.body.default_language).toBe('af')
  })

  it('updates multiple settings at once', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', adminToken())
      .send({ farm_name: 'Multi Farm', default_language: 'en' })

    expect(res.status).toBe(200)
    expect(res.body.farm_name).toBe('Multi Farm')
    expect(res.body.default_language).toBe('en')
  })

  it('returns 400 for empty body', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', adminToken())
      .send({})

    expect(res.status).toBe(400)
  })

  it('persists changes across requests', async () => {
    await request(app)
      .patch('/api/settings')
      .set('Authorization', adminToken())
      .send({ farm_name: 'Persisted Farm' })

    const res = await request(app).get('/api/settings?farm_code=TEST')
    expect(res.body.farm_name).toBe('Persisted Farm')
  })
})
