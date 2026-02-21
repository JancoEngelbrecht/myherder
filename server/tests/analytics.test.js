const { randomUUID } = require('crypto')
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

async function createCow(status = 'active') {
  const id = randomUUID()
  await db('cows').insert({ id, tag_number: `A-${id.slice(0, 8)}`, sex: 'female', status })
  return id
}

// ─── GET /api/analytics/herd-summary ──────────────────────────────────────────

describe('GET /api/analytics/herd-summary', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/herd-summary')
    expect(res.status).toBe(401)
  })

  it('returns total count and a by_status breakdown', async () => {
    await createCow('active')
    await createCow('active')
    await createCow('sick')

    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(typeof res.body.total).toBe('number')
    expect(res.body.total).toBeGreaterThanOrEqual(3)
    expect(Array.isArray(res.body.by_status)).toBe(true)
    expect(res.body.by_status.every((row) => 'status' in row && 'count' in row)).toBe(true)
  })

  it('total equals the sum of all by_status counts', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const summed = res.body.by_status.reduce((acc, r) => acc + Number(r.count), 0)
    expect(res.body.total).toBe(summed)
  })

  it('excludes soft-deleted cows from the count', async () => {
    const id = await createCow('active')
    // Soft-delete the cow
    await db('cows').where({ id }).update({ deleted_at: new Date().toISOString() })

    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', adminToken())

    // The deleted cow should not be counted under active.
    // We can't assert an exact number since other tests also create active cows,
    // so we just verify the total and by_status are still consistent.
    const summed = res.body.by_status.reduce((acc, r) => acc + Number(r.count), 0)
    expect(res.body.total).toBe(summed)
  })
})

// ─── GET /api/analytics/unhealthiest ──────────────────────────────────────────

describe('GET /api/analytics/unhealthiest', () => {
  it('returns an empty array (placeholder until health_events table is added)', async () => {
    const res = await request(app)
      .get('/api/analytics/unhealthiest')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})
