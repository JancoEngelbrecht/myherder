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

describe('GET /api/export', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/export')
    expect(res.status).toBe(401)
  })

  it('returns 403 for a worker token', async () => {
    const res = await request(app).get('/api/export').set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('returns JSON export with all tables for admin', async () => {
    const res = await request(app).get('/api/export').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body._meta).toBeDefined()
    expect(res.body._meta.exportedAt).toBeDefined()
    expect(typeof res.body._meta.totalRecords).toBe('number')
    expect(res.body.tables).toBeDefined()

    const tables = res.body.tables
    expect(Array.isArray(tables.users)).toBe(true)
    expect(Array.isArray(tables.cows)).toBe(true)
    expect(Array.isArray(tables.health_issues)).toBe(true)
    expect(Array.isArray(tables.treatments)).toBe(true)
    expect(Array.isArray(tables.medications)).toBe(true)
    expect(Array.isArray(tables.milk_records)).toBe(true)
    expect(Array.isArray(tables.breeding_events)).toBe(true)
    expect(Array.isArray(tables.breed_types)).toBe(true)
    expect(Array.isArray(tables.issue_types)).toBe(true)
    expect(Array.isArray(tables.app_settings)).toBe(true)
    expect(Array.isArray(tables.feature_flags)).toBe(true)
  })

  it('strips password_hash and pin_hash from users', async () => {
    const res = await request(app).get('/api/export').set('Authorization', adminToken())

    for (const user of res.body.tables.users) {
      expect(user.password_hash).toBeUndefined()
      expect(user.pin_hash).toBeUndefined()
    }
  })

  it('includes seed users in export', async () => {
    const res = await request(app).get('/api/export').set('Authorization', adminToken())

    const usernames = res.body.tables.users.map((u) => u.username)
    expect(usernames).toContain('test_admin')
    expect(usernames).toContain('test_worker')
  })

  it('sets Content-Disposition header for download', async () => {
    const res = await request(app).get('/api/export').set('Authorization', adminToken())

    expect(res.headers['content-disposition']).toMatch(/attachment.*myherder-export.*\.json/)
  })
})
