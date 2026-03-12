const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const bcrypt = require('bcryptjs')
const { seedUsers, DEFAULT_FARM_ID, seedFarm } = require('./helpers/setup')
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
  await db('cows').del()
  await db('users').del()
  await db('farms').del()
  // Reset default_* tables to migration seed data
  await db('default_medications').del()
  await db('default_issue_types').del()
  await db('default_breed_types').del()
  await db.raw('PRAGMA foreign_keys = ON')

  // Re-seed default tables from migration data
  const { randomUUID } = require('crypto')
  const now = new Date().toISOString()

  await db('default_breed_types').insert([
    { id: randomUUID(), code: 'holstein', name: 'Holstein', heat_cycle_days: 21, gestation_days: 280, preg_check_days: 35, voluntary_waiting_days: 50, dry_off_days: 60, calf_max_months: 6, heifer_min_months: 15, young_bull_min_months: 15, sort_order: 0, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'jersey', name: 'Jersey', heat_cycle_days: 21, gestation_days: 279, preg_check_days: 35, voluntary_waiting_days: 45, dry_off_days: 60, calf_max_months: 6, heifer_min_months: 14, young_bull_min_months: 15, sort_order: 1, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'ayrshire', name: 'Ayrshire', heat_cycle_days: 21, gestation_days: 279, preg_check_days: 35, voluntary_waiting_days: 45, dry_off_days: 60, calf_max_months: 6, heifer_min_months: 15, young_bull_min_months: 15, sort_order: 2, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'nguni', name: 'Nguni', heat_cycle_days: 21, gestation_days: 285, preg_check_days: 35, voluntary_waiting_days: 60, dry_off_days: 60, calf_max_months: 8, heifer_min_months: 18, young_bull_min_months: 15, sort_order: 3, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'brahman', name: 'Brahman', heat_cycle_days: 21, gestation_days: 292, preg_check_days: 35, voluntary_waiting_days: 60, dry_off_days: 60, calf_max_months: 8, heifer_min_months: 24, young_bull_min_months: 15, sort_order: 4, is_active: true, created_at: now, updated_at: now },
  ])

  await db('default_issue_types').insert([
    { id: randomUUID(), code: 'lameness', name: 'Lameness', emoji: '🦵', requires_teat_selection: false, sort_order: 0, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'mastitis', name: 'Mastitis', emoji: '🍼', requires_teat_selection: true, sort_order: 1, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'respiratory', name: 'Respiratory', emoji: '🫁', requires_teat_selection: false, sort_order: 2, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'digestive', name: 'Digestive', emoji: '🤢', requires_teat_selection: false, sort_order: 3, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'fever', name: 'Fever', emoji: '🌡️', requires_teat_selection: false, sort_order: 4, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'bad_milk', name: 'Bad Milk', emoji: '🥛', requires_teat_selection: true, sort_order: 5, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'eye', name: 'Eye', emoji: '👁️', requires_teat_selection: false, sort_order: 6, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'calving', name: 'Calving', emoji: '🐄', requires_teat_selection: false, sort_order: 7, is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), code: 'other', name: 'Other', emoji: '❓', requires_teat_selection: false, sort_order: 8, is_active: true, created_at: now, updated_at: now },
  ])

  await db('default_medications').insert([
    { id: randomUUID(), name: 'Penicillin G', active_ingredient: 'Benzylpenicillin', withdrawal_milk_hours: 72, withdrawal_milk_days: 0, withdrawal_meat_hours: 0, withdrawal_meat_days: 10, default_dosage: '5ml', unit: 'ml', notes: 'Broad-spectrum antibiotic. Administer IM.', is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), name: 'Oxytetracycline 200mg/ml', active_ingredient: 'Oxytetracycline', withdrawal_milk_hours: 96, withdrawal_milk_days: 0, withdrawal_meat_hours: 0, withdrawal_meat_days: 28, default_dosage: '10ml', unit: 'ml', notes: 'Long-acting. For respiratory and systemic infections.', is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), name: 'Flunixin Meglumine (Banamine)', active_ingredient: 'Flunixin', withdrawal_milk_hours: 36, withdrawal_milk_days: 0, withdrawal_meat_hours: 0, withdrawal_meat_days: 4, default_dosage: '2ml', unit: 'ml', notes: 'NSAID. Anti-inflammatory and analgesic.', is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), name: 'Mastitis Intramammary Tube', active_ingredient: 'Cloxacillin', withdrawal_milk_hours: 96, withdrawal_milk_days: 0, withdrawal_meat_hours: 0, withdrawal_meat_days: 7, default_dosage: '1 tube', unit: 'tube', notes: 'For mastitis. Infuse directly into affected quarter after milking.', is_active: true, created_at: now, updated_at: now },
    { id: randomUUID(), name: 'Vitamins B-complex', active_ingredient: 'B-vitamins', withdrawal_milk_hours: 0, withdrawal_milk_days: 0, withdrawal_meat_hours: 0, withdrawal_meat_days: 0, default_dosage: '10ml', unit: 'ml', notes: 'No withdrawal period. General supplementation.', is_active: true, created_at: now, updated_at: now },
  ])

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

// ── Breed Types ──────────────────────────────────────────────

describe('GET /api/global-defaults/breed-types', () => {
  it('returns seeded default breed types', async () => {
    const res = await request(app)
      .get('/api/global-defaults/breed-types')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(5)
    expect(res.body[0].code).toBe('holstein')
  })

  it('rejects non-super-admin', async () => {
    const res = await request(app)
      .get('/api/global-defaults/breed-types')
      .set('Authorization', adminToken())
    expect(res.status).toBe(403)
  })
})

describe('POST /api/global-defaults/breed-types', () => {
  it('creates a new default breed type', async () => {
    const res = await request(app)
      .post('/api/global-defaults/breed-types')
      .set('Authorization', superAdminToken())
      .send({ name: 'Angus', heat_cycle_days: 21, gestation_days: 283 })
    expect(res.status).toBe(201)
    expect(res.body.code).toBe('angus')
    expect(res.body.name).toBe('Angus')
  })

  it('rejects duplicate code', async () => {
    const res = await request(app)
      .post('/api/global-defaults/breed-types')
      .set('Authorization', superAdminToken())
      .send({ name: 'Holstein' }) // auto-generates code 'holstein' which exists
    expect(res.status).toBe(409)
  })
})

describe('PATCH /api/global-defaults/breed-types/:id', () => {
  it('updates a default breed type', async () => {
    const types = await db('default_breed_types').select('id')
    const res = await request(app)
      .patch(`/api/global-defaults/breed-types/${types[0].id}`)
      .set('Authorization', superAdminToken())
      .send({ gestation_days: 290 })
    expect(res.status).toBe(200)
    expect(res.body.gestation_days).toBe(290)
  })

  it('returns 404 for non-existent', async () => {
    const res = await request(app)
      .patch('/api/global-defaults/breed-types/00000000-0000-0000-0000-000000000000')
      .set('Authorization', superAdminToken())
      .send({ gestation_days: 290 })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/global-defaults/breed-types/:id', () => {
  it('deactivates a default breed type', async () => {
    const types = await db('default_breed_types').select('id')
    const res = await request(app)
      .delete(`/api/global-defaults/breed-types/${types[0].id}`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.is_active).toBeFalsy()
  })
})

// ── Issue Types ──────────────────────────────────────────────

describe('GET /api/global-defaults/issue-types', () => {
  it('returns seeded default issue types', async () => {
    const res = await request(app)
      .get('/api/global-defaults/issue-types')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(9)
  })
})

describe('POST /api/global-defaults/issue-types', () => {
  it('creates a new default issue type', async () => {
    const res = await request(app)
      .post('/api/global-defaults/issue-types')
      .set('Authorization', superAdminToken())
      .send({ name: 'Bloat', emoji: '🎈' })
    expect(res.status).toBe(201)
    expect(res.body.code).toBe('bloat')
  })
})

describe('PATCH /api/global-defaults/issue-types/:id', () => {
  it('updates a default issue type', async () => {
    const types = await db('default_issue_types').select('id')
    const res = await request(app)
      .patch(`/api/global-defaults/issue-types/${types[0].id}`)
      .set('Authorization', superAdminToken())
      .send({ emoji: '🦶' })
    expect(res.status).toBe(200)
    expect(res.body.emoji).toBe('🦶')
  })
})

// ── Medications ──────────────────────────────────────────────

describe('GET /api/global-defaults/medications', () => {
  it('returns seeded default medications', async () => {
    const res = await request(app)
      .get('/api/global-defaults/medications')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(5)
  })

  it('includes inactive when all=1', async () => {
    // Deactivate one
    const meds = await db('default_medications').select('id')
    await db('default_medications').where('id', meds[0].id).update({ is_active: false })

    const active = await request(app)
      .get('/api/global-defaults/medications')
      .set('Authorization', superAdminToken())
    expect(active.body.length).toBe(4)

    const all = await request(app)
      .get('/api/global-defaults/medications?all=1')
      .set('Authorization', superAdminToken())
    expect(all.body.length).toBe(5)
  })
})

describe('POST /api/global-defaults/medications', () => {
  it('creates a new default medication', async () => {
    const res = await request(app)
      .post('/api/global-defaults/medications')
      .set('Authorization', superAdminToken())
      .send({
        name: 'Ibuprofen',
        withdrawal_milk_hours: 48,
        withdrawal_meat_days: 5,
      })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Ibuprofen')
  })

  it('rejects duplicate name', async () => {
    const res = await request(app)
      .post('/api/global-defaults/medications')
      .set('Authorization', superAdminToken())
      .send({
        name: 'Penicillin G',
        withdrawal_milk_hours: 72,
        withdrawal_meat_days: 10,
      })
    expect(res.status).toBe(409)
  })
})

describe('PATCH /api/global-defaults/medications/:id', () => {
  it('updates a default medication', async () => {
    const meds = await db('default_medications').select('id')
    const res = await request(app)
      .patch(`/api/global-defaults/medications/${meds[0].id}`)
      .set('Authorization', superAdminToken())
      .send({ withdrawal_milk_hours: 100 })
    expect(res.status).toBe(200)
    expect(res.body.withdrawal_milk_hours).toBe(100)
  })
})

describe('DELETE /api/global-defaults/medications/:id', () => {
  it('deactivates a default medication', async () => {
    const meds = await db('default_medications').select('id')
    const res = await request(app)
      .delete(`/api/global-defaults/medications/${meds[0].id}`)
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.is_active).toBeFalsy()
  })
})

// ── Push to Farms ────────────────────────────────────────────

describe('POST /api/global-defaults/:type/push', () => {
  it('pushes breed types to all farms', async () => {
    // Create a farm with no breed types
    const farmId = await seedFarm(db, 'PUSH1', 'Push Farm')

    const res = await request(app)
      .post('/api/global-defaults/breed-types/push')
      .set('Authorization', superAdminToken())
      .send({ farm_ids: 'all' })
    expect(res.status).toBe(200)
    expect(res.body.pushed).toBeGreaterThan(0)
    expect(res.body.farms_affected).toBeGreaterThan(0)

    // Verify farm now has breed types
    const farmBreeds = await db('breed_types').where('farm_id', farmId)
    expect(farmBreeds.length).toBe(5)
  })

  it('skips existing items', async () => {
    // Seed breed types for DEFAULT_FARM so push has something to skip
    const { randomUUID } = require('crypto')
    const seedNow = new Date().toISOString()
    await db('breed_types').insert(
      ['holstein', 'jersey', 'ayrshire', 'nguni', 'brahman'].map((code, i) => ({
        id: randomUUID(), farm_id: DEFAULT_FARM_ID, code, name: code,
        heat_cycle_days: 21, gestation_days: 280, preg_check_days: 35,
        voluntary_waiting_days: 50, dry_off_days: 60, calf_max_months: 6,
        heifer_min_months: 15, young_bull_min_months: 15, sort_order: i,
        is_active: true, created_at: seedNow, updated_at: seedNow,
      }))
    )

    const res = await request(app)
      .post('/api/global-defaults/breed-types/push')
      .set('Authorization', superAdminToken())
      .send({ farm_ids: [DEFAULT_FARM_ID] })
    expect(res.status).toBe(200)
    expect(res.body.skipped).toBe(5)
    expect(res.body.pushed).toBe(0)
  })

  it('pushes medications to specific farms', async () => {
    const farmId = await seedFarm(db, 'PUSH2', 'Push Farm 2')

    const res = await request(app)
      .post('/api/global-defaults/medications/push')
      .set('Authorization', superAdminToken())
      .send({ farm_ids: [farmId] })
    expect(res.status).toBe(200)
    expect(res.body.pushed).toBe(5)
    expect(res.body.farms_affected).toBe(1)
  })

  it('validates farm_ids', async () => {
    const res = await request(app)
      .post('/api/global-defaults/breed-types/push')
      .set('Authorization', superAdminToken())
      .send({ farm_ids: [] })
    expect(res.status).toBe(400)
  })
})

// ── farmSeedService reads from default_* tables ──────────────

describe('farmSeedService uses default_* tables', () => {
  it('seeds new farm from default tables', async () => {
    // Add a custom default medication
    await db('default_medications').insert({
      id: '99999999-9999-4999-9999-999999999999',
      name: 'Custom Med',
      withdrawal_milk_hours: 24,
      withdrawal_meat_days: 3,
      withdrawal_milk_days: 0,
      withdrawal_meat_hours: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const res = await request(app)
      .post('/api/farms')
      .set('Authorization', superAdminToken())
      .send({
        name: 'Seed Test Farm',
        code: 'SEEDTEST',
        admin_username: 'seedadmin',
        admin_password: 'pass123',
        admin_full_name: 'Seed Admin',
      })
    expect(res.status).toBe(201)

    // Should have 6 medications (5 default + 1 custom)
    const meds = await db('medications').where('farm_id', res.body.farm.id)
    expect(meds.length).toBe(6)
    expect(meds.some((m) => m.name === 'Custom Med')).toBe(true)
  })
})
