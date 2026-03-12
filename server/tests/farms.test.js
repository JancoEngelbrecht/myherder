const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const bcrypt = require('bcryptjs')
const { seedUsers, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken, workerToken, superAdminToken, SUPER_ADMIN_ID } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  // Clean in dependency order
  await db.raw('PRAGMA foreign_keys = OFF')
  await db('audit_log').del()
  await db('feature_flags').del()
  await db('app_settings').del()
  await db('medications').del()
  await db('issue_type_definitions').del()
  await db('breed_types').del()
  await db('breeding_events').del()
  await db('treatments').del()
  await db('health_issues').del()
  await db('milk_records').del()
  await db('cows').del()
  await db('users').del()
  await db('farms').del()
  await db.raw('PRAGMA foreign_keys = ON')

  await seedUsers(db)

  // Seed super_admin user (DB requires farm_id NOT NULL; JWT has farm_id: null)
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

describe('GET /api/farms', () => {
  it('returns farm list with stats for super-admin', async () => {
    const res = await request(app)
      .get('/api/farms')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    const farm = res.body.find((f) => f.id === DEFAULT_FARM_ID)
    expect(farm).toBeDefined()
    expect(typeof farm.user_count).toBe('number')
    expect(typeof farm.cow_count).toBe('number')
  })

  it('rejects non-super-admin', async () => {
    const res = await request(app)
      .get('/api/farms')
      .set('Authorization', adminToken())
    expect(res.status).toBe(403)
  })

  it('rejects workers', async () => {
    const res = await request(app)
      .get('/api/farms')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('filters by active status', async () => {
    const res = await request(app)
      .get('/api/farms?active=1')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.every((f) => f.is_active)).toBe(true)
  })
})

describe('GET /api/farms/:id', () => {
  it('returns farm detail with users', async () => {
    const res = await request(app)
      .get(`/api/farms/${DEFAULT_FARM_ID}`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Test Farm')
    expect(Array.isArray(res.body.users)).toBe(true)
    expect(res.body.users.length).toBe(3) // admin + worker + super_admin (all in DEFAULT_FARM)
  })

  it('returns 404 for non-existent farm', async () => {
    const res = await request(app)
      .get('/api/farms/00000000-0000-0000-0000-000000000000')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(404)
  })
})

describe('POST /api/farms', () => {
  it('creates a farm with admin user and seed data', async () => {
    const res = await request(app)
      .post('/api/farms')
      .set('Authorization', superAdminToken())
      .send({
        name: 'New Farm',
        code: 'NEWFARM',
        admin_username: 'newfarmadmin',
        admin_password: 'password123',
        admin_full_name: 'New Farm Admin',
      })
    expect(res.status).toBe(201)
    expect(res.body.farm.name).toBe('New Farm')
    expect(res.body.farm.code).toBe('NEWFARM')
    expect(res.body.farm.slug).toBe('newfarm')
    expect(res.body.admin_user.username).toBe('newfarmadmin')
    expect(res.body.admin_user.role).toBe('admin')

    // Verify seed data was created
    const breedTypes = await db('breed_types').where('farm_id', res.body.farm.id)
    expect(breedTypes.length).toBe(5)

    const issueTypes = await db('issue_type_definitions').where('farm_id', res.body.farm.id)
    expect(issueTypes.length).toBe(9)

    const meds = await db('medications').where('farm_id', res.body.farm.id)
    expect(meds.length).toBe(5)

    const flags = await db('feature_flags').where('farm_id', res.body.farm.id)
    expect(flags.length).toBe(5)

    const settings = await db('app_settings').where('farm_id', res.body.farm.id)
    expect(settings.length).toBe(2)
  })

  it('rejects duplicate farm code', async () => {
    await request(app)
      .post('/api/farms')
      .set('Authorization', superAdminToken())
      .send({
        name: 'Farm A',
        code: 'DUPL',
        admin_username: 'admin1',
        admin_password: 'pass123',
        admin_full_name: 'Admin 1',
      })
    const res = await request(app)
      .post('/api/farms')
      .set('Authorization', superAdminToken())
      .send({
        name: 'Farm B',
        code: 'DUPL',
        admin_username: 'admin2',
        admin_password: 'pass123',
        admin_full_name: 'Admin 2',
      })
    expect(res.status).toBe(409)
  })

  it('validates farm code format', async () => {
    const res = await request(app)
      .post('/api/farms')
      .set('Authorization', superAdminToken())
      .send({
        name: 'Bad Code',
        code: 'ab',
        admin_username: 'admin',
        admin_password: 'pass123',
        admin_full_name: 'Admin',
      })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/farms/:id', () => {
  it('updates farm name and code', async () => {
    const res = await request(app)
      .patch(`/api/farms/${DEFAULT_FARM_ID}`)
      .set('Authorization', superAdminToken())
      .send({ name: 'Updated Farm', code: 'UPDATED' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated Farm')
    expect(res.body.code).toBe('UPDATED')
    expect(res.body.slug).toBe('updated')
  })

  it('rejects duplicate code on update', async () => {
    // Create another farm first
    await request(app)
      .post('/api/farms')
      .set('Authorization', superAdminToken())
      .send({
        name: 'Other',
        code: 'OTHER',
        admin_username: 'other',
        admin_password: 'pass123',
        admin_full_name: 'Other Admin',
      })

    const res = await request(app)
      .patch(`/api/farms/${DEFAULT_FARM_ID}`)
      .set('Authorization', superAdminToken())
      .send({ code: 'OTHER' })
    expect(res.status).toBe(409)
  })
})

describe('DELETE /api/farms/:id', () => {
  it('deactivates farm', async () => {
    const res = await request(app)
      .delete(`/api/farms/${DEFAULT_FARM_ID}`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)

    const farm = await db('farms').where('id', DEFAULT_FARM_ID).first()
    expect(farm.is_active).toBeFalsy()
  })
})

describe('POST /api/farms/:id/enter', () => {
  it('issues a farm-scoped JWT for super-admin', async () => {
    const res = await request(app)
      .post(`/api/farms/${DEFAULT_FARM_ID}/enter`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.farm_id).toBe(DEFAULT_FARM_ID)
    expect(res.body.user.role).toBe('super_admin')
    expect(res.body.farm.id).toBe(DEFAULT_FARM_ID)
  })

  it('allows entering an inactive farm', async () => {
    await db('farms').where('id', DEFAULT_FARM_ID).update({ is_active: false })
    const res = await request(app)
      .post(`/api/farms/${DEFAULT_FARM_ID}/enter`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
  })

  it('returns 404 for non-existent farm', async () => {
    const res = await request(app)
      .post('/api/farms/00000000-0000-0000-0000-000000000000/enter')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(404)
  })
})

describe('GET /api/farms/export', () => {
  it('returns cross-farm JSON export', async () => {
    const res = await request(app)
      .get('/api/farms/export')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body._meta).toBeDefined()
    expect(res.body._meta.farm_count).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(res.body.farms)).toBe(true)
    expect(res.body.farms[0].farm).toBeDefined()
    expect(res.body.farms[0].users).toBeDefined()
  })

  it('rejects non-super-admin', async () => {
    const res = await request(app)
      .get('/api/farms/export')
      .set('Authorization', adminToken())
    expect(res.status).toBe(403)
  })
})

describe('GET /api/farms/stats', () => {
  it('returns aggregate system stats', async () => {
    const res = await request(app)
      .get('/api/farms/stats')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(typeof res.body.total_farms).toBe('number')
    expect(typeof res.body.active_farms).toBe('number')
    expect(typeof res.body.total_users).toBe('number')
    expect(typeof res.body.total_cows).toBe('number')
    expect(res.body.total_farms).toBeGreaterThanOrEqual(1)
  })
})

describe('POST /api/farms/:id/revoke-all-sessions', () => {
  it('increments token_version for all farm users', async () => {
    const before = await db('users').where('farm_id', DEFAULT_FARM_ID).select('id', 'token_version')
    const res = await request(app)
      .post(`/api/farms/${DEFAULT_FARM_ID}/revoke-all-sessions`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.revoked).toBe(true)

    const after = await db('users').where('farm_id', DEFAULT_FARM_ID).select('id', 'token_version')
    for (const user of after) {
      const prev = before.find((u) => u.id === user.id)
      expect(user.token_version).toBe((prev?.token_version || 0) + 1)
    }
  })
})
