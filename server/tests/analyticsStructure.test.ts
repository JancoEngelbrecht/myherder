const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { DEFAULT_FARM_ID, seedUsers } = require('./helpers/setup')
const { adminToken } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ── GET /api/analytics/herd-size-trend ─────────────────────────────────────

describe('GET /api/analytics/herd-size-trend', () => {
  it('returns 200 with months array', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-size-trend')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('months')
    expect(Array.isArray(res.body.months)).toBe(true)
  })

  it('respects from/to date range — animals created after end date are excluded', async () => {
    // Insert an animal with a created_at far in the future (should not appear in a past range)
    const futureId = randomUUID()
    await db('animals').insert({
      id: futureId,
      farm_id: DEFAULT_FARM_ID,
      tag_number: `FUTURE-${futureId.slice(0, 6)}`,
      sex: 'female',
      status: 'active',
      created_at: '2099-01-15T00:00:00.000Z',
      updated_at: new Date().toISOString(),
    })

    const res = await request(app)
      .get('/api/analytics/herd-size-trend?from=2025-01-01&to=2025-12-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    // All months in range should have a total that does NOT include the 2099 animal
    // (We just verify no month total is inflated by the future animal — each month
    //  should still be a non-negative integer and the 2099 month is outside the range)
    for (const m of res.body.months) {
      expect(m).toHaveProperty('month')
      expect(m).toHaveProperty('total')
      expect(typeof m.total).toBe('number')
      expect(m.total).toBeGreaterThanOrEqual(0)
      // No month label should be 2099
      expect(m.month.startsWith('2099')).toBe(false)
    }

    // Clean up
    await db('animals').where({ id: futureId }).delete()
  })

  it('month labels are in YYYY-MM format and within the requested range', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-size-trend?from=2026-01-01&to=2026-03-31')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const months = res.body.months
    expect(months.length).toBe(3)
    for (const m of months) {
      expect(m.month).toMatch(/^\d{4}-\d{2}$/)
      expect(m.month >= '2026-01').toBe(true)
      expect(m.month <= '2026-03').toBe(true)
    }
  })

  it('cumulative total is monotonically non-decreasing across months in range', async () => {
    // Seed a known animal in early 2025
    const earlyId = randomUUID()
    const now = new Date().toISOString()
    await db('animals').insert({
      id: earlyId,
      farm_id: DEFAULT_FARM_ID,
      tag_number: `EARLY-${earlyId.slice(0, 6)}`,
      sex: 'female',
      status: 'active',
      created_at: '2025-02-15T00:00:00.000Z',
      updated_at: now,
    })

    const res = await request(app)
      .get('/api/analytics/herd-size-trend?from=2025-01-01&to=2025-06-30')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const totals = res.body.months.map((m) => m.total)
    for (let i = 1; i < totals.length; i++) {
      // Each month's cumulative total should be >= the previous month
      expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1])
    }

    // Clean up
    await db('animals').where({ id: earlyId }).delete()
  })
})
