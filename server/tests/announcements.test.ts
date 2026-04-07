const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const bcrypt = require('bcryptjs')
const { seedUsers, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken, superAdminToken, SUPER_ADMIN_ID } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  await db.raw('PRAGMA foreign_keys = OFF')
  await db('announcement_dismissals').del()
  await db('system_announcements').del()
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
  await db('animals').del()
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

describe('GET /api/announcements/active', () => {
  it('returns active non-expired announcements without auth', async () => {
    await db('system_announcements').insert({
      id: 'ann-1',
      type: 'info',
      title: 'Test Announcement',
      message: 'Hello world',
      is_active: true,
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app).get('/api/announcements/active')
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
    expect(res.body[0].title).toBe('Test Announcement')
  })

  it('excludes inactive announcements', async () => {
    await db('system_announcements').insert({
      id: 'ann-2',
      type: 'info',
      title: 'Inactive',
      is_active: false,
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app).get('/api/announcements/active')
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(0)
  })

  it('excludes expired announcements', async () => {
    await db('system_announcements').insert({
      id: 'ann-3',
      type: 'warning',
      title: 'Expired',
      is_active: true,
      expires_at: '2020-01-01T00:00:00.000Z',
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app).get('/api/announcements/active')
    expect(res.body.length).toBe(0)
  })

  it('excludes future-scheduled announcements', async () => {
    await db('system_announcements').insert({
      id: 'ann-4',
      type: 'info',
      title: 'Future',
      is_active: true,
      starts_at: '2099-01-01T00:00:00.000Z',
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app).get('/api/announcements/active')
    expect(res.body.length).toBe(0)
  })
})

describe('GET /api/announcements', () => {
  it('returns all announcements for super-admin', async () => {
    await db('system_announcements').insert([
      {
        id: 'ann-a',
        type: 'info',
        title: 'A',
        is_active: true,
        created_by: SUPER_ADMIN_ID,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'ann-b',
        type: 'warning',
        title: 'B',
        is_active: false,
        created_by: SUPER_ADMIN_ID,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])

    const res = await request(app).get('/api/announcements').set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
  })

  it('rejects non-super-admin', async () => {
    const res = await request(app).get('/api/announcements').set('Authorization', adminToken())
    expect(res.status).toBe(403)
  })
})

describe('POST /api/announcements', () => {
  it('creates an announcement', async () => {
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', superAdminToken())
      .send({ type: 'warning', title: 'Maintenance', message: 'Planned downtime' })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('Maintenance')
    expect(res.body.type).toBe('warning')
    expect(res.body.created_by).toBe(SUPER_ADMIN_ID)
  })

  it('validates required fields', async () => {
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', superAdminToken())
      .send({})
    expect(res.status).toBe(400)
  })

  it('validates type enum', async () => {
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', superAdminToken())
      .send({ type: 'critical', title: 'Bad Type' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/announcements/:id', () => {
  it('updates an announcement', async () => {
    await db('system_announcements').insert({
      id: 'ann-up',
      type: 'info',
      title: 'Original',
      is_active: true,
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app)
      .patch('/api/announcements/ann-up')
      .set('Authorization', superAdminToken())
      .send({ title: 'Updated', type: 'maintenance' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Updated')
    expect(res.body.type).toBe('maintenance')
  })

  it('returns 404 for non-existent', async () => {
    const res = await request(app)
      .patch('/api/announcements/nonexistent')
      .set('Authorization', superAdminToken())
      .send({ title: 'Nope' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/announcements/:id', () => {
  it('deactivates an announcement', async () => {
    await db('system_announcements').insert({
      id: 'ann-del',
      type: 'info',
      title: 'To Deactivate',
      is_active: true,
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app)
      .delete('/api/announcements/ann-del')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.is_active).toBeFalsy()
  })
})

describe('POST /api/announcements/:id/permanent', () => {
  it('permanently deletes an inactive announcement and its dismissals', async () => {
    await db('system_announcements').insert({
      id: 'ann-perm',
      type: 'info',
      title: 'To Delete',
      is_active: false,
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    await db('announcement_dismissals').insert({
      announcement_id: 'ann-perm',
      user_id: SUPER_ADMIN_ID,
      dismissed_at: new Date().toISOString(),
    })

    const res = await request(app)
      .post('/api/announcements/ann-perm/permanent')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)

    const ann = await db('system_announcements').where('id', 'ann-perm').first()
    expect(ann).toBeUndefined()
    const dismissals = await db('announcement_dismissals').where('announcement_id', 'ann-perm')
    expect(dismissals.length).toBe(0)
  })

  it('permanently deletes an active-but-expired announcement', async () => {
    await db('system_announcements').insert({
      id: 'ann-expired',
      type: 'info',
      title: 'Expired Active',
      is_active: true,
      expires_at: '2020-01-01T00:00:00.000Z',
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app)
      .post('/api/announcements/ann-expired/permanent')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)

    const ann = await db('system_announcements').where('id', 'ann-expired').first()
    expect(ann).toBeUndefined()
  })

  it('returns 400 when announcement is still active', async () => {
    await db('system_announcements').insert({
      id: 'ann-active',
      type: 'info',
      title: 'Still Active',
      is_active: true,
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app)
      .post('/api/announcements/ann-active/permanent')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent announcement', async () => {
    const res = await request(app)
      .post('/api/announcements/nonexistent/permanent')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(404)
  })

  it('rejects non-super-admin', async () => {
    await db('system_announcements').insert({
      id: 'ann-auth',
      type: 'info',
      title: 'Auth Test',
      is_active: false,
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app)
      .post('/api/announcements/ann-auth/permanent')
      .set('Authorization', adminToken())
    expect(res.status).toBe(403)
  })
})

describe('POST /api/announcements/:id/dismiss', () => {
  it('dismisses an announcement for current user', async () => {
    await db('system_announcements').insert({
      id: 'ann-dis',
      type: 'info',
      title: 'Dismissable',
      is_active: true,
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app)
      .post('/api/announcements/ann-dis/dismiss')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
    expect(res.body.dismissed).toBe(true)

    // Verify dismissal in DB
    const dismissal = await db('announcement_dismissals')
      .where({ announcement_id: 'ann-dis' })
      .first()
    expect(dismissal).toBeDefined()
  })

  it('is idempotent', async () => {
    await db('system_announcements').insert({
      id: 'ann-idem',
      type: 'info',
      title: 'Idempotent',
      is_active: true,
      created_by: SUPER_ADMIN_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    await request(app)
      .post('/api/announcements/ann-idem/dismiss')
      .set('Authorization', adminToken())

    const res = await request(app)
      .post('/api/announcements/ann-idem/dismiss')
      .set('Authorization', adminToken())
    expect(res.status).toBe(200)
  })
})
