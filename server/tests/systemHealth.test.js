const request = require('supertest')
const jwt = require('jsonwebtoken')
const app = require('../app')
const db = require('../config/database')
const { jwtSecret } = require('../config/env')
const { resetStats } = require('../helpers/requestStats')
const { seedUsers, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken, workerToken, superAdminToken, SUPER_ADMIN_ID } = require('./helpers/tokens')
const bcrypt = require('bcryptjs')

beforeAll(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  resetStats()

  await db.raw('PRAGMA foreign_keys = OFF')
  await db('audit_log').del()
  await db('users').del()
  await db('farms').del()
  await db.raw('PRAGMA foreign_keys = ON')

  await seedUsers(db)

  await db('users').insert({
    id: SUPER_ADMIN_ID,
    farm_id: DEFAULT_FARM_ID,
    username: 'super_admin',
    full_name: 'Super Admin',
    role: 'super_admin',
    password_hash: bcrypt.hashSync('super123', 4),
    permissions: JSON.stringify([]),
    language: 'en',
    is_active: true,
    failed_attempts: 0,
    token_version: 0,
  })
})

afterAll(async () => {
  await db.destroy()
})

describe('GET /api/system/health', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/system/health')
    expect(res.status).toBe(401)
  })

  it('returns 403 for admin users', async () => {
    const res = await request(app)
      .get('/api/system/health')
      .set('Authorization', adminToken())
    expect(res.status).toBe(403)
  })

  it('returns 403 for worker users', async () => {
    const res = await request(app)
      .get('/api/system/health')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('returns 403 for super-admin in farm context', async () => {
    // Super-admin who has entered a farm gets a JWT with farm_id set
    const farmContextToken = `Bearer ${jwt.sign({
      id: SUPER_ADMIN_ID,
      farm_id: DEFAULT_FARM_ID,
      username: 'super_admin',
      full_name: 'Super Admin',
      role: 'super_admin',
      permissions: [],
      language: 'en',
      token_version: 0,
    }, jwtSecret, { expiresIn: '1h' })}`

    const res = await request(app)
      .get('/api/system/health')
      .set('Authorization', farmContextToken)
    expect(res.status).toBe(403)
  })

  it('returns health metrics for super-admin', async () => {
    const res = await request(app)
      .get('/api/system/health')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)

    const body = res.body
    // Top-level fields
    expect(body).toHaveProperty('node_version')
    expect(body.node_version).toMatch(/^v\d+/)
    expect(body).toHaveProperty('uptime_seconds')
    expect(typeof body.uptime_seconds).toBe('number')

    // Memory
    expect(body.memory).toHaveProperty('rss_mb')
    expect(body.memory).toHaveProperty('heap_used_mb')
    expect(body.memory).toHaveProperty('heap_total_mb')
    expect(body.memory.rss_mb).toBeGreaterThan(0)

    // Database (SQLite in test — returns size_mb + empty tables)
    expect(body.database).toHaveProperty('size_mb')
    expect(body.database).toHaveProperty('tables')

    // Requests
    expect(body.requests).toHaveProperty('total')
    expect(body.requests).toHaveProperty('errors_4xx')
    expect(body.requests).toHaveProperty('errors_5xx')
    expect(body.requests).toHaveProperty('avg_response_ms')
    expect(body.requests).toHaveProperty('p95_response_ms')
    expect(body.requests).toHaveProperty('started_at')
    // Current request hasn't finished yet when getStats() runs, so total may be 0
    expect(typeof body.requests.total).toBe('number')

    // Thresholds
    expect(body.thresholds).toHaveProperty('memory_status')
    expect(body.thresholds).toHaveProperty('disk_status')
    expect(body.thresholds).toHaveProperty('response_status')
    expect(body.thresholds).toHaveProperty('error_status')
    expect(['green', 'yellow', 'red']).toContain(body.thresholds.memory_status)
    expect(['green', 'yellow', 'red', 'unknown']).toContain(body.thresholds.disk_status)
  })

  it('returns disk as null on non-Linux platforms', async () => {
    const res = await request(app)
      .get('/api/system/health')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    // disk is null on Windows/unsupported, object on Linux
    if (res.body.disk === null) {
      expect(res.body.thresholds.disk_status).toBe('unknown')
    } else {
      expect(res.body.disk).toHaveProperty('used_pct')
      expect(typeof res.body.disk.used_pct).toBe('number')
    }
  })

  it('returns database info for SQLite test environment', async () => {
    const res = await request(app)
      .get('/api/system/health')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    // In-memory SQLite (test config) returns size_mb: 0, empty tables
    expect(res.body.database.size_mb).toBeGreaterThanOrEqual(0)
    expect(res.body.database.tables).toEqual([])
  })

  it('tracks request stats accurately with isolated counters', async () => {
    // Stats were reset in beforeEach — these are the only requests
    await request(app).get('/api/system/health') // 401
    await request(app).get('/api/system/health') // 401

    const res = await request(app)
      .get('/api/system/health')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    // The two 401s are recorded on finish before this request starts.
    // The current (3rd) request hasn't finished yet when getStats() runs.
    expect(res.body.requests.total).toBe(2)
    expect(res.body.requests.errors_4xx).toBe(2)
  })

  it('includes error_rate_5xx_pct field', async () => {
    const res = await request(app)
      .get('/api/system/health')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(typeof res.body.requests.error_rate_5xx_pct).toBe('number')
  })
})
