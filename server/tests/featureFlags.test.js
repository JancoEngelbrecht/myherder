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

// ─── GET /api/feature-flags ────────────────────────────────────────────────────

describe('GET /api/feature-flags', () => {
  it('returns all flags as camelCase object', async () => {
    const res = await request(app)
      .get('/api/feature-flags')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('breeding')
    expect(res.body).toHaveProperty('milkRecording')
    expect(res.body).toHaveProperty('healthIssues')
    expect(res.body).toHaveProperty('treatments')
    expect(res.body).toHaveProperty('analytics')
    // All values should be booleans
    for (const val of Object.values(res.body)) {
      expect(typeof val).toBe('boolean')
    }
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/feature-flags')
    expect(res.status).toBe(401)
  })
})

// ─── PATCH /api/feature-flags ──────────────────────────────────────────────────

describe('PATCH /api/feature-flags', () => {
  it('toggles a single flag (admin)', async () => {
    // Get current value
    const before = await request(app)
      .get('/api/feature-flags')
      .set('Authorization', adminToken())
    const originalValue = before.body.breeding

    const res = await request(app)
      .patch('/api/feature-flags')
      .set('Authorization', adminToken())
      .send({ breeding: !originalValue })

    expect(res.status).toBe(200)
    expect(res.body.breeding).toBe(!originalValue)

    // Restore
    await request(app)
      .patch('/api/feature-flags')
      .set('Authorization', adminToken())
      .send({ breeding: originalValue })
  })

  it('updates multiple flags at once', async () => {
    const res = await request(app)
      .patch('/api/feature-flags')
      .set('Authorization', adminToken())
      .send({ breeding: true, analytics: true })

    expect(res.status).toBe(200)
    expect(res.body.breeding).toBe(true)
    expect(res.body.analytics).toBe(true)
  })

  it('returns updated full flags object', async () => {
    const res = await request(app)
      .patch('/api/feature-flags')
      .set('Authorization', adminToken())
      .send({ treatments: true })

    expect(res.status).toBe(200)
    // Should return all flags, not just the updated one
    expect(Object.keys(res.body).length).toBeGreaterThanOrEqual(5)
  })

  it('returns 403 for worker role', async () => {
    const res = await request(app)
      .patch('/api/feature-flags')
      .set('Authorization', workerToken())
      .send({ breeding: false })

    expect(res.status).toBe(403)
  })

  it('returns 400 with invalid/unknown key', async () => {
    const res = await request(app)
      .patch('/api/feature-flags')
      .set('Authorization', adminToken())
      .send({ unknownFlag: true })

    expect(res.status).toBe(400)
  })

  it('returns 400 with non-boolean value', async () => {
    const res = await request(app)
      .patch('/api/feature-flags')
      .set('Authorization', adminToken())
      .send({ breeding: 'yes' })

    expect(res.status).toBe(400)
  })
})
