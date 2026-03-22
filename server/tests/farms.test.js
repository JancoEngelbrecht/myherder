const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const bcrypt = require('bcryptjs')
const { randomUUID } = require('crypto')
const { seedUsers, seedFarm, seedFarmUser, seedCow, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken, workerToken, superAdminToken, SUPER_ADMIN_ID } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  // Clean in dependency order
  await db.raw('PRAGMA foreign_keys = OFF')
  await db('audit_log').del()
  await db('sync_log').del()
  await db('feature_flags').del()
  await db('app_settings').del()
  await db('health_issue_comments').del()
  await db('medications').del()
  await db('issue_type_definitions').del()
  await db('breed_types').del()
  await db('breeding_events').del()
  await db('treatments').del()
  await db('health_issues').del()
  await db('milk_records').del()
  await db('cows').del()
  await db('users').del()
  await db('farm_species').del()
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
    const res = await request(app).get('/api/farms').set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    const farm = res.body.find((f) => f.id === DEFAULT_FARM_ID)
    expect(farm).toBeDefined()
    expect(typeof farm.user_count).toBe('number')
    expect(typeof farm.cow_count).toBe('number')
  })

  it('rejects non-super-admin', async () => {
    const res = await request(app).get('/api/farms').set('Authorization', adminToken())
    expect(res.status).toBe(403)
  })

  it('rejects workers', async () => {
    const res = await request(app).get('/api/farms').set('Authorization', workerToken())
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
  it('returns farm detail with users and feature flags', async () => {
    // Seed feature flags for the farm
    await db('feature_flags').insert([
      { farm_id: DEFAULT_FARM_ID, key: 'breeding', enabled: true },
      { farm_id: DEFAULT_FARM_ID, key: 'milk_recording', enabled: true },
      { farm_id: DEFAULT_FARM_ID, key: 'health_issues', enabled: true },
      { farm_id: DEFAULT_FARM_ID, key: 'treatments', enabled: true },
      { farm_id: DEFAULT_FARM_ID, key: 'analytics', enabled: false },
    ])

    const res = await request(app)
      .get(`/api/farms/${DEFAULT_FARM_ID}`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Test Farm')
    expect(Array.isArray(res.body.users)).toBe(true)
    expect(res.body.users.length).toBe(3) // admin + worker + super_admin (all in DEFAULT_FARM)
    expect(res.body.feature_flags).toBeDefined()
    expect(res.body.feature_flags.breeding).toBe(true)
    expect(res.body.feature_flags.milkRecording).toBe(true)
    expect(res.body.feature_flags.analytics).toBe(false)
  })

  it('returns 404 for non-existent farm', async () => {
    const res = await request(app)
      .get('/api/farms/00000000-0000-0000-0000-000000000000')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/farms/:id/feature-flags', () => {
  beforeEach(async () => {
    await db('feature_flags').insert([
      { farm_id: DEFAULT_FARM_ID, key: 'breeding', enabled: true },
      { farm_id: DEFAULT_FARM_ID, key: 'milk_recording', enabled: true },
      { farm_id: DEFAULT_FARM_ID, key: 'health_issues', enabled: true },
      { farm_id: DEFAULT_FARM_ID, key: 'treatments', enabled: true },
      { farm_id: DEFAULT_FARM_ID, key: 'analytics', enabled: true },
    ])
  })

  it('toggles a flag and returns updated flags', async () => {
    const res = await request(app)
      .patch(`/api/farms/${DEFAULT_FARM_ID}/feature-flags`)
      .set('Authorization', superAdminToken())
      .send({ milkRecording: false })
    expect(res.status).toBe(200)
    expect(res.body.milkRecording).toBe(false)
    expect(res.body.breeding).toBe(true) // others unchanged
  })

  it('inserts flag row if missing', async () => {
    await db('feature_flags').where({ farm_id: DEFAULT_FARM_ID, key: 'milk_recording' }).del()
    const res = await request(app)
      .patch(`/api/farms/${DEFAULT_FARM_ID}/feature-flags`)
      .set('Authorization', superAdminToken())
      .send({ milkRecording: true })
    expect(res.status).toBe(200)
    expect(res.body.milkRecording).toBe(true)
  })

  it('returns 404 for non-existent farm', async () => {
    const res = await request(app)
      .patch('/api/farms/00000000-0000-0000-0000-000000000000/feature-flags')
      .set('Authorization', superAdminToken())
      .send({ breeding: false })
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .patch(`/api/farms/${DEFAULT_FARM_ID}/feature-flags`)
      .set('Authorization', superAdminToken())
      .send({ badKey: true })
    expect(res.status).toBe(400)
  })

  it('rejects non-super-admin', async () => {
    const res = await request(app)
      .patch(`/api/farms/${DEFAULT_FARM_ID}/feature-flags`)
      .set('Authorization', adminToken())
      .send({ breeding: false })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/farms', () => {
  it('creates a farm with admin user and seed data', async () => {
    const res = await request(app).post('/api/farms').set('Authorization', superAdminToken()).send({
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

    // Verify seed data was created (cattle breed types only; issue types + meds are all species)
    const breedTypes = await db('breed_types').where('farm_id', res.body.farm.id)
    expect(breedTypes.length).toBe(5) // cattle only (filtered by species)

    const issueTypes = await db('issue_type_definitions').where('farm_id', res.body.farm.id)
    expect(issueTypes.length).toBe(14) // 9 base + 5 sheep-specific from migration 035

    const meds = await db('medications').where('farm_id', res.body.farm.id)
    expect(meds.length).toBe(8) // 5 base + 3 sheep-specific from migration 035

    // Verify farm_species row created (defaults to cattle)
    const farmSpecies = await db('farm_species').where('farm_id', res.body.farm.id)
    expect(farmSpecies.length).toBe(1)
    expect(farmSpecies[0].species_id).toBe('00000000-0000-4000-a000-000000000001')

    const flags = await db('feature_flags').where('farm_id', res.body.farm.id)
    expect(flags.length).toBe(5)

    const settings = await db('app_settings').where('farm_id', res.body.farm.id)
    expect(settings.length).toBe(2)
  })

  it('rejects duplicate farm code', async () => {
    await request(app).post('/api/farms').set('Authorization', superAdminToken()).send({
      name: 'Farm A',
      code: 'DUPL',
      admin_username: 'admin1',
      admin_password: 'pass123',
      admin_full_name: 'Admin 1',
    })
    const res = await request(app).post('/api/farms').set('Authorization', superAdminToken()).send({
      name: 'Farm B',
      code: 'DUPL',
      admin_username: 'admin2',
      admin_password: 'pass123',
      admin_full_name: 'Admin 2',
    })
    expect(res.status).toBe(409)
  })

  it('validates farm code format', async () => {
    const res = await request(app).post('/api/farms').set('Authorization', superAdminToken()).send({
      name: 'Bad Code',
      code: 'ab',
      admin_username: 'admin',
      admin_password: 'pass123',
      admin_full_name: 'Admin',
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/farms — species selection', () => {
  it('creates a sheep farm with species_code and seeds sheep breed types', async () => {
    const sheep = await db('species').where({ code: 'sheep' }).first()

    const res = await request(app).post('/api/farms').set('Authorization', superAdminToken()).send({
      name: 'Sheep Farm',
      code: 'SHPFRM',
      admin_username: 'sheepfarmadmin',
      admin_password: 'password123',
      admin_full_name: 'Sheep Farm Admin',
      species_code: 'sheep',
    })

    expect(res.status).toBe(201)
    expect(res.body.farm.name).toBe('Sheep Farm')

    // Sheep breed types seeded (Dorper, Meatmaster, SA Mutton Merino, Dohne Merino = 4)
    const breedTypes = await db('breed_types').where('farm_id', res.body.farm.id)
    expect(breedTypes.length).toBe(4)
    const codes = breedTypes.map((bt) => bt.code)
    expect(codes).toContain('dorper')
    expect(codes).not.toContain('holstein_friesian')

    // farm_species row uses sheep species_id
    const farmSpecies = await db('farm_species').where('farm_id', res.body.farm.id)
    expect(farmSpecies.length).toBe(1)
    expect(farmSpecies[0].species_id).toBe(sheep.id)

    // Sheep farms have milkRecording off
    const flags = await db('feature_flags').where({
      farm_id: res.body.farm.id,
      key: 'milk_recording',
    })
    expect(flags.length).toBe(1)
    expect(flags[0].enabled).toBeFalsy()
  })

  it('cattle farm defaults to cattle species and has milkRecording enabled', async () => {
    const cattle = await db('species').where({ code: 'cattle' }).first()

    const res = await request(app).post('/api/farms').set('Authorization', superAdminToken()).send({
      name: 'Cattle Farm',
      code: 'CTLFRM',
      admin_username: 'cattlefarmadmin',
      admin_password: 'password123',
      admin_full_name: 'Cattle Farm Admin',
    })

    expect(res.status).toBe(201)

    const farmSpecies = await db('farm_species').where('farm_id', res.body.farm.id)
    expect(farmSpecies[0].species_id).toBe(cattle.id)

    const milkFlag = await db('feature_flags').where({
      farm_id: res.body.farm.id,
      key: 'milk_recording',
    })
    expect(milkFlag.length).toBe(1)
    expect(milkFlag[0].enabled).toBeTruthy()
  })

  it('rejects unknown species_code', async () => {
    const res = await request(app).post('/api/farms').set('Authorization', superAdminToken()).send({
      name: 'Bad Species Farm',
      code: 'BADSPC',
      admin_username: 'badspeciesadmin',
      admin_password: 'password123',
      admin_full_name: 'Bad Species Admin',
      species_code: 'goat',
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/unknown species/i)
  })
})

describe('GET /api/farms/:id — species info', () => {
  it('returns species info in farm detail when farm_species row exists', async () => {
    const cattle = await db('species').where({ code: 'cattle' }).first()
    // Ensure the default test farm has a farm_species row (beforeEach clears it)
    await db('farm_species')
      .insert({ farm_id: DEFAULT_FARM_ID, species_id: cattle.id })
      .onConflict(['farm_id'])
      .ignore()

    const res = await request(app)
      .get(`/api/farms/${DEFAULT_FARM_ID}`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.species).toBeDefined()
    expect(res.body.species.code).toBe('cattle')
  })

  it('returns null species when no farm_species row exists', async () => {
    // Default test farm has no farm_species row after beforeEach cleanup
    const res = await request(app)
      .get(`/api/farms/${DEFAULT_FARM_ID}`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.species).toBeNull()
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
    await request(app).post('/api/farms').set('Authorization', superAdminToken()).send({
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

describe('DELETE /api/farms/:id — hard delete', () => {
  let targetFarmId, targetUserId

  beforeEach(async () => {
    // Seed a second farm with full data to delete
    targetFarmId = await seedFarm(db, 'DELME', 'Delete Me Farm')
    targetUserId = await seedFarmUser(db, targetFarmId, {
      username: 'delme_admin',
      password: 'pass123',
    })
    const cowId = await seedCow(db, targetFarmId)

    const now = new Date().toISOString()
    const medId = randomUUID()
    const hiId = randomUUID()

    // Seed related data
    await db('medications').insert({
      id: medId,
      farm_id: targetFarmId,
      name: 'TestMed',
      active_ingredient: 'Test',
      withdrawal_milk_hours: 48,
      withdrawal_meat_days: 7,
      is_active: true,
    })
    await db('breed_types').insert({
      id: randomUUID(),
      farm_id: targetFarmId,
      code: 'tst',
      name: 'Test Breed',
      is_active: true,
    })
    await db('issue_type_definitions').insert({
      id: randomUUID(),
      farm_id: targetFarmId,
      code: 'tst_issue',
      name: 'Test Issue',
      emoji: '🔴',
      is_active: true,
    })
    await db('health_issues').insert({
      id: hiId,
      farm_id: targetFarmId,
      cow_id: cowId,
      reported_by: targetUserId,
      issue_types: JSON.stringify(['tst_issue']),
      severity: 'medium',
      status: 'open',
      observed_at: '2026-01-01',
      created_at: now,
      updated_at: now,
    })
    await db('health_issue_comments').insert({
      id: randomUUID(),
      farm_id: targetFarmId,
      health_issue_id: hiId,
      user_id: targetUserId,
      comment: 'test',
      created_at: now,
      updated_at: now,
    })
    await db('treatments').insert({
      id: randomUUID(),
      farm_id: targetFarmId,
      cow_id: cowId,
      medication_id: medId,
      administered_by: targetUserId,
      treatment_date: '2026-01-01',
      created_at: now,
      updated_at: now,
    })
    await db('milk_records').insert({
      id: randomUUID(),
      farm_id: targetFarmId,
      cow_id: cowId,
      recorded_by: targetUserId,
      session: 'morning',
      litres: 10,
      recording_date: '2026-01-01',
      created_at: now,
      updated_at: now,
    })
    await db('breeding_events').insert({
      id: randomUUID(),
      farm_id: targetFarmId,
      cow_id: cowId,
      event_type: 'heat_observed',
      event_date: '2026-01-01',
      recorded_by: targetUserId,
    })
    await db('feature_flags').insert({
      farm_id: targetFarmId,
      key: 'breeding',
      enabled: true,
      updated_at: now,
    })
    await db('app_settings').insert({
      farm_id: targetFarmId,
      key: 'farm_name',
      value: 'Delete Me Farm',
      updated_at: now,
    })
    await db('farm_species').insert({
      farm_id: targetFarmId,
      species_id: '00000000-0000-4000-a000-000000000001',
    })
    await db('audit_log').insert({
      id: randomUUID(),
      farm_id: targetFarmId,
      user_id: targetUserId,
      action: 'create',
      entity_type: 'cow',
      entity_id: cowId,
      created_at: now,
    })
    await db('sync_log').insert({
      id: randomUUID(),
      farm_id: targetFarmId,
      user_id: targetUserId,
      device_id: 'test-device',
      action: 'push',
      records_count: 1,
      status: 'success',
      synced_at: now,
    })
  })

  it('hard deletes farm and all associated data', async () => {
    const res = await request(app)
      .delete(`/api/farms/${targetFarmId}`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/permanently deleted/)

    // Verify all data is gone
    expect(await db('farms').where('id', targetFarmId).first()).toBeUndefined()
    expect(await db('users').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('cows').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('treatments').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('milk_records').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('health_issues').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('health_issue_comments').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('breeding_events').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('medications').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('breed_types').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(
      await db('issue_type_definitions').where('farm_id', targetFarmId).first()
    ).toBeUndefined()
    expect(await db('feature_flags').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('app_settings').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('farm_species').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('audit_log').where('farm_id', targetFarmId).first()).toBeUndefined()
    expect(await db('sync_log').where('farm_id', targetFarmId).first()).toBeUndefined()
  })

  it('returns 404 for non-existent farm', async () => {
    const res = await request(app)
      .delete('/api/farms/00000000-0000-0000-0000-000000000000')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(404)
  })

  it('returns 403 for admin token', async () => {
    const res = await request(app)
      .delete(`/api/farms/${targetFarmId}`)
      .set('Authorization', adminToken())
    expect(res.status).toBe(403)
  })

  it('returns 403 for worker token', async () => {
    const res = await request(app)
      .delete(`/api/farms/${targetFarmId}`)
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })

  it('returns 409 if super-admin user is assigned to farm', async () => {
    await db('users').insert({
      id: 'sa-block-1',
      farm_id: targetFarmId,
      username: 'sa_block',
      full_name: 'Blocking SA',
      role: 'super_admin',
      password_hash: bcrypt.hashSync('pass123', 4),
      permissions: '[]',
      language: 'en',
      is_active: true,
      failed_attempts: 0,
      token_version: 0,
    })

    const res = await request(app)
      .delete(`/api/farms/${targetFarmId}`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/super-admin/)

    // Verify farm data was NOT deleted
    expect(await db('farms').where('id', targetFarmId).first()).toBeDefined()
    expect(await db('cows').where('farm_id', targetFarmId).first()).toBeDefined()
  })

  it('does not affect other farms data (cross-tenant safety)', async () => {
    // Count default farm data before
    const cowsBefore = await db('cows').where('farm_id', DEFAULT_FARM_ID).count('* as c').first()
    const usersBefore = await db('users').where('farm_id', DEFAULT_FARM_ID).count('* as c').first()

    await request(app).delete(`/api/farms/${targetFarmId}`).set('Authorization', superAdminToken())

    // Default farm data unchanged
    const cowsAfter = await db('cows').where('farm_id', DEFAULT_FARM_ID).count('* as c').first()
    const usersAfter = await db('users').where('farm_id', DEFAULT_FARM_ID).count('* as c').first()
    expect(Number(cowsAfter.c)).toBe(Number(cowsBefore.c))
    expect(Number(usersAfter.c)).toBe(Number(usersBefore.c))
    expect(await db('farms').where('id', DEFAULT_FARM_ID).first()).toBeDefined()
  })
})

describe('PATCH /api/farms/:id — deactivate', () => {
  it('deactivates farm via PATCH', async () => {
    const res = await request(app)
      .patch(`/api/farms/${DEFAULT_FARM_ID}`)
      .set('Authorization', superAdminToken())
      .send({ is_active: false })
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
    const res = await request(app).get('/api/farms/export').set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body._meta).toBeDefined()
    expect(res.body._meta.farm_count).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(res.body.farms)).toBe(true)
    expect(res.body.farms[0].farm).toBeDefined()
    expect(res.body.farms[0].users).toBeDefined()
  })

  it('rejects non-super-admin', async () => {
    const res = await request(app).get('/api/farms/export').set('Authorization', adminToken())
    expect(res.status).toBe(403)
  })
})

describe('GET /api/farms/stats', () => {
  it('returns aggregate system stats', async () => {
    const res = await request(app).get('/api/farms/stats').set('Authorization', superAdminToken())
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
