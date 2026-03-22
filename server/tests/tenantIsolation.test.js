/**
 * Cross-Tenant Isolation Tests
 *
 * Verifies that no data leaks between farms. Two farms (A and B) are seeded
 * with identical data structures. Each test confirms that Farm B's token
 * cannot access Farm A's resources and vice versa.
 *
 * Cross-tenant access returns 404 (not 403) — don't reveal existence.
 */
const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers, seedFarm, seedFarmUser, tokenForFarm, seedCow } = require('./helpers/setup')

// ── Farm context ───────────────────────────────────────────────────────────────

let farmAId, farmBId, farmCId
let farmAAdminId, farmBAdminId
let farmAToken, farmBToken, farmCToken

// Shared entity IDs created in Farm A
let cowA1, cowA2
let milkRecordA
let healthIssueA
let treatmentA
let breedingEventA
let medicationA

// Shared entity IDs created in Farm B (for verification)
let cowB1

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db) // seeds DEFAULT farm + admin/worker

  // Seed Farm A, Farm B, Farm C (empty — edge case)
  farmAId = await seedFarm(db, 'FARMA', 'Alpha Farm')
  farmBId = await seedFarm(db, 'FARMB', 'Beta Farm')
  farmCId = await seedFarm(db, 'FARMC', 'Empty Farm')

  farmAAdminId = await seedFarmUser(db, farmAId, { username: 'admin_a', password: 'pass123' })
  farmBAdminId = await seedFarmUser(db, farmBId, { username: 'admin_b', password: 'pass123' })
  const farmCAdminId = await seedFarmUser(db, farmCId, { username: 'admin_c', password: 'pass123' })

  farmAToken = tokenForFarm(farmAId, farmAAdminId)
  farmBToken = tokenForFarm(farmBId, farmBAdminId)
  farmCToken = tokenForFarm(farmCId, farmCAdminId)

  // Seed issue type + breed type in both farms (needed for health issues and breeding)
  await db('issue_type_definitions').insert([
    {
      id: randomUUID(),
      farm_id: farmAId,
      name: 'Mastitis',
      code: 'mastitis',
      emoji: '🔴',
      is_active: true,
    },
    {
      id: randomUUID(),
      farm_id: farmBId,
      name: 'Mastitis',
      code: 'mastitis',
      emoji: '🔴',
      is_active: true,
    },
  ])
  await db('breed_types').insert([
    { id: randomUUID(), farm_id: farmAId, name: 'Holstein', code: 'holstein', is_active: true },
    { id: randomUUID(), farm_id: farmBId, name: 'Holstein', code: 'holstein', is_active: true },
  ])

  // Seed cows in Farm A
  cowA1 = await seedCow(db, farmAId, { tag_number: 'COW001', name: 'Bessie' })
  cowA2 = await seedCow(db, farmAId, { tag_number: 'COW002', name: 'Daisy' })

  // Seed same tag in Farm B (should be allowed)
  cowB1 = await seedCow(db, farmBId, { tag_number: 'COW001', name: 'Betty' })

  // Seed medication in Farm A
  const medId = randomUUID()
  medicationA = medId
  await db('medications').insert({
    id: medId,
    farm_id: farmAId,
    name: 'Penicillin',
    active_ingredient: 'Penicillin G',
    withdrawal_milk_days: 4,
    withdrawal_milk_hours: 0,
    withdrawal_meat_days: 14,
    withdrawal_meat_hours: 0,
    is_active: true,
  })

  // Seed milk record in Farm A
  const mrId = randomUUID()
  milkRecordA = mrId
  await db('milk_records').insert({
    id: mrId,
    farm_id: farmAId,
    cow_id: cowA1,
    recorded_by: farmAAdminId,
    session: 'morning',
    litres: 12.5,
    recording_date: '2026-03-01',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  // Seed health issue in Farm A
  const hiId = randomUUID()
  healthIssueA = hiId
  await db('health_issues').insert({
    id: hiId,
    farm_id: farmAId,
    cow_id: cowA1,
    issue_types: JSON.stringify(['mastitis']),
    severity: 'high',
    status: 'open',
    observed_at: '2026-03-01T08:00:00.000Z',
    reported_by: farmAAdminId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  // Seed treatment in Farm A
  const txId = randomUUID()
  treatmentA = txId
  await db('treatments').insert({
    id: txId,
    farm_id: farmAId,
    cow_id: cowA1,
    medication_id: medId,
    treatment_date: '2026-03-01',
    administered_by: farmAAdminId,
    cost: 25.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  // Seed breeding event in Farm A
  const beId = randomUUID()
  breedingEventA = beId
  await db('breeding_events').insert({
    id: beId,
    farm_id: farmAId,
    cow_id: cowA1,
    event_type: 'ai_insemination',
    event_date: '2026-02-15',
    notes: 'Test AI',
    recorded_by: farmAAdminId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  // Seed audit log entry in Farm A
  await db('audit_log').insert({
    id: randomUUID(),
    farm_id: farmAId,
    user_id: farmAAdminId,
    action: 'create',
    entity_type: 'cow',
    entity_id: cowA1,
    created_at: new Date().toISOString(),
  })
})

afterAll(() => db.destroy())

// ═══════════════════════════════════════════════════════════════════════════════
// COWS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cows isolation', () => {
  it('Farm B cannot GET Farm A cow by ID → 404', async () => {
    const res = await request(app).get(`/api/cows/${cowA1}`).set('Authorization', farmBToken)
    expect(res.status).toBe(404)
  })

  it('Farm B list returns zero Farm A cows', async () => {
    const res = await request(app).get('/api/cows').set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const ids = res.body.map((c) => c.id)
    expect(ids).not.toContain(cowA1)
    expect(ids).not.toContain(cowA2)
    // Farm B should see its own cow
    expect(ids).toContain(cowB1)
  })

  it('Farm B cannot UPDATE Farm A cow → 404', async () => {
    const res = await request(app)
      .put(`/api/cows/${cowA1}`)
      .set('Authorization', farmBToken)
      .send({ name: 'Hacked' })
    expect(res.status).toBe(404)
  })

  it('Farm B cannot DELETE Farm A cow → 404', async () => {
    const res = await request(app).delete(`/api/cows/${cowA1}`).set('Authorization', farmBToken)
    expect(res.status).toBe(404)
  })

  it('same tag_number allowed in both farms', async () => {
    const resA = await request(app).get('/api/cows?search=COW001').set('Authorization', farmAToken)
    const resB = await request(app).get('/api/cows?search=COW001').set('Authorization', farmBToken)

    expect(resA.body.length).toBeGreaterThanOrEqual(1)
    expect(resB.body.length).toBeGreaterThanOrEqual(1)
    // They should be different cows
    expect(resA.body[0].id).not.toBe(resB.body[0].id)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MILK RECORDS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Milk Records isolation', () => {
  it('Farm B cannot GET Farm A milk record → 404', async () => {
    const res = await request(app)
      .get(`/api/milk-records/${milkRecordA}`)
      .set('Authorization', farmBToken)
    expect(res.status).toBe(404)
  })

  it('Farm B list returns zero Farm A records', async () => {
    const res = await request(app).get('/api/milk-records').set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const body = Array.isArray(res.body) ? res.body : res.body.data
    const ids = body.map((r) => r.id)
    expect(ids).not.toContain(milkRecordA)
  })

  it('Farm B cannot UPDATE Farm A milk record → 404', async () => {
    const res = await request(app)
      .put(`/api/milk-records/${milkRecordA}`)
      .set('Authorization', farmBToken)
      .send({ litres: 99 })
    expect(res.status).toBe(404)
  })

  it('Farm B cannot DELETE Farm A milk record → 404', async () => {
    const res = await request(app)
      .delete(`/api/milk-records/${milkRecordA}`)
      .set('Authorization', farmBToken)
    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH ISSUES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Health Issues isolation', () => {
  it('Farm B cannot GET Farm A issue → 404', async () => {
    const res = await request(app)
      .get(`/api/health-issues/${healthIssueA}`)
      .set('Authorization', farmBToken)
    expect(res.status).toBe(404)
  })

  it('Farm B list returns zero Farm A issues', async () => {
    const res = await request(app).get('/api/health-issues').set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const body = Array.isArray(res.body) ? res.body : res.body.data
    const ids = body.map((r) => r.id)
    expect(ids).not.toContain(healthIssueA)
  })

  it('Farm B cannot change Farm A issue status → 404', async () => {
    const res = await request(app)
      .patch(`/api/health-issues/${healthIssueA}/status`)
      .set('Authorization', farmBToken)
      .send({ status: 'resolved' })
    expect(res.status).toBe(404)
  })

  it('Farm B cannot DELETE Farm A issue → 404', async () => {
    const res = await request(app)
      .delete(`/api/health-issues/${healthIssueA}`)
      .set('Authorization', farmBToken)
    expect(res.status).toBe(404)
  })

  it('Farm B cannot POST comment on Farm A issue → 404', async () => {
    const res = await request(app)
      .post(`/api/health-issues/${healthIssueA}/comments`)
      .set('Authorization', farmBToken)
      .send({ comment: 'Cross-tenant comment attempt' })
    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TREATMENTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Treatments isolation', () => {
  it('Farm B cannot GET Farm A treatment by ID → 404', async () => {
    const res = await request(app)
      .get(`/api/treatments/${treatmentA}`)
      .set('Authorization', farmBToken)
    expect(res.status).toBe(404)
  })

  it('Farm B unfiltered list contains zero Farm A treatments', async () => {
    const res = await request(app).get('/api/treatments').set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const body = Array.isArray(res.body) ? res.body : res.body.data
    const ids = body.map((r) => r.id)
    expect(ids).not.toContain(treatmentA)
  })

  it('Farm B list with Farm A cow_id returns empty', async () => {
    const res = await request(app)
      .get(`/api/treatments?cow_id=${cowA1}`)
      .set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const body = Array.isArray(res.body) ? res.body : res.body.data
    expect(body.length).toBe(0)
  })

  it('Farm B cannot DELETE Farm A treatment → 404', async () => {
    const res = await request(app)
      .delete(`/api/treatments/${treatmentA}`)
      .set('Authorization', farmBToken)
    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// BREEDING EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Breeding Events isolation', () => {
  it('Farm B cannot GET Farm A breeding event by ID → 404', async () => {
    const res = await request(app)
      .get(`/api/breeding-events/${breedingEventA}`)
      .set('Authorization', farmBToken)
    expect(res.status).toBe(404)
  })

  it('Farm B list with Farm A cow_id returns empty', async () => {
    const res = await request(app)
      .get(`/api/breeding-events?cow_id=${cowA1}`)
      .set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const body = Array.isArray(res.body) ? res.body : res.body.data
    expect(body.length).toBe(0)
  })

  it('Farm B cannot PATCH (edit) Farm A event → 404', async () => {
    const res = await request(app)
      .patch(`/api/breeding-events/${breedingEventA}`)
      .set('Authorization', farmBToken)
      .send({ notes: 'Hacked' })
    expect(res.status).toBe(404)
  })

  it('Farm B cannot dismiss Farm A event → 404', async () => {
    const res = await request(app)
      .patch(`/api/breeding-events/${breedingEventA}/dismiss`)
      .set('Authorization', farmBToken)
      .send({ reason: 'test' })
    expect(res.status).toBe(404)
  })

  it('Farm B upcoming returns zero Farm A events', async () => {
    const res = await request(app)
      .get('/api/breeding-events/upcoming')
      .set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const allIds = [
      ...(res.body.heats || []),
      ...(res.body.calvings || []),
      ...(res.body.pregChecks || []),
      ...(res.body.dryOffs || []),
      ...(res.body.needsAttention || []),
    ].map((e) => e.cow_id)
    expect(allIds).not.toContain(cowA1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MEDICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Medications isolation', () => {
  it('Farm B cannot GET Farm A medication by ID → 404', async () => {
    const res = await request(app)
      .get(`/api/medications/${medicationA}`)
      .set('Authorization', farmBToken)
    expect(res.status).toBe(404)
  })

  it('Farm B list returns zero Farm A medications', async () => {
    const res = await request(app).get('/api/medications').set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const ids = res.body.map((m) => m.id)
    expect(ids).not.toContain(medicationA)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS — one representative per analytics category file
// (full analytics endpoint coverage is in server/tests/analytics/*.test.js)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Analytics isolation', () => {
  it('KPI: Farm B daily-kpis reflect only Farm B data (zero litres)', async () => {
    const res = await request(app).get('/api/analytics/daily-kpis').set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    expect(Number(res.body.litres_today)).toBe(0)
  })

  it('Structure: Farm B herd-summary counts only Farm B cows', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    expect(Number(res.body.total)).toBe(1)
  })

  it('Financial: Farm B top-producers returns only Farm B cows', async () => {
    // Seed 3 milk records for Farm B cow so it passes the >= 3 days gate
    const now = new Date().toISOString()
    await db('milk_records').insert([
      {
        id: randomUUID(),
        farm_id: farmBId,
        cow_id: cowB1,
        recorded_by: farmBAdminId,
        session: 'morning',
        litres: 10,
        recording_date: '2026-03-01',
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        farm_id: farmBId,
        cow_id: cowB1,
        recorded_by: farmBAdminId,
        session: 'morning',
        litres: 10,
        recording_date: '2026-03-02',
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        farm_id: farmBId,
        cow_id: cowB1,
        recorded_by: farmBAdminId,
        session: 'morning',
        litres: 10,
        recording_date: '2026-03-03',
        created_at: now,
        updated_at: now,
      },
    ])
    const res = await request(app)
      .get('/api/analytics/top-producers?from=2026-01-01&to=2026-12-31')
      .set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    const ids = res.body.map((c) => c.id)
    expect(ids).toContain(cowB1)
    expect(ids).not.toContain(cowA1)
  })

  it('Health: Farm B unhealthiest returns zero Farm A cows', async () => {
    const res = await request(app)
      .get('/api/analytics/unhealthiest?from=2026-01-01&to=2026-12-31')
      .set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const ids = res.body.map((c) => c.id)
    expect(ids).not.toContain(cowA1)
  })

  it('Fertility: Farm B breeding-overview returns zero Farm A data', async () => {
    const res = await request(app)
      .get('/api/analytics/breeding-overview?from=2026-01-01&to=2026-12-31')
      .set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    expect(Number(res.body.pregnant_count)).toBe(0)
  })

  it('Financial: Farm B treatment-costs returns zero', async () => {
    const res = await request(app)
      .get('/api/analytics/treatment-costs?from=2026-01-01&to=2026-12-31')
      .set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    expect(Number(res.body.grand_total)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Reports isolation', () => {
  it('Farm B treatment-history report succeeds with no Farm A data', async () => {
    const res = await request(app)
      .get('/api/reports/treatment-history?from=2026-01-01&to=2026-12-31&format=xlsx')
      .set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Export isolation', () => {
  it('Farm B export contains zero Farm A records', async () => {
    const res = await request(app).get('/api/export').set('Authorization', farmBToken)
    expect(res.status).toBe(200)

    const { tables } = res.body
    const allCowIds = tables.cows.map((c) => c.id)
    expect(allCowIds).not.toContain(cowA1)
    expect(allCowIds).not.toContain(cowA2)
    expect(tables.treatments.length).toBe(0)
    expect(tables.health_issues.length).toBe(0)
    expect(tables.milk_records.length).toBe(3)
    expect(tables.milk_records.every((r) => r.cow_id === cowB1)).toBe(true)
    expect(tables.breeding_events.length).toBe(0)
    expect(tables.medications.length).toBe(0)
  })

  it('export strips password_hash and pin_hash from users', async () => {
    const res = await request(app).get('/api/export').set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const users = res.body.tables.users
    expect(users.every((u) => !u.password_hash && !u.pin_hash)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════════

describe('Audit Log isolation', () => {
  it('Farm B audit log contains zero Farm A entries', async () => {
    const res = await request(app).get('/api/audit-log').set('Authorization', farmBToken)
    expect(res.status).toBe(200)
    const entries = res.body.data || []
    expect(entries.some((e) => e.entity_id === cowA1)).toBe(false)
    expect(entries.some((e) => e.user_id === farmAAdminId)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC
// ═══════════════════════════════════════════════════════════════════════════════

describe('Sync isolation', () => {
  it('Farm B pull returns zero Farm A data', async () => {
    const res = await request(app).get('/api/sync/pull?full=1').set('Authorization', farmBToken)
    expect(res.status).toBe(200)

    const cowIds = (res.body.cows || []).map((c) => c.id)
    expect(cowIds).not.toContain(cowA1)
    expect(cowIds).not.toContain(cowA2)
    expect(cowIds).toContain(cowB1)

    const medIds = (res.body.medications || []).map((m) => m.id)
    expect(medIds).not.toContain(medicationA)
  })

  it('Farm B push creates cow in Farm B namespace', async () => {
    const newCowId = randomUUID()
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', farmBToken)
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'cows',
            action: 'create',
            id: newCowId,
            data: {
              tag_number: 'SYNC001',
              name: 'Sync Cow',
              sex: 'female',
              status: 'active',
            },
            updatedAt: new Date().toISOString(),
          },
        ],
      })
    expect(res.status).toBe(200)

    const cow = await db('cows').where({ id: newCowId }).first()
    expect(cow).toBeTruthy()
    expect(cow.farm_id).toBe(farmBId)
    expect(cow.farm_id).not.toBe(farmAId)
  })

  it('Farm B push cannot update Farm A cow via sync', async () => {
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', farmBToken)
      .send({
        deviceId: randomUUID(),
        changes: [
          {
            entityType: 'cows',
            action: 'update',
            id: cowA1,
            data: { name: 'Hacked via sync' },
            updatedAt: new Date().toISOString(),
          },
        ],
      })
    expect(res.status).toBe(200)
    // The individual change result should be an error (not found in Farm B scope)
    expect(res.body.results[0].status).toBe('error')

    // Verify Farm A cow is unchanged
    const cow = await db('cows').where({ id: cowA1 }).first()
    expect(cow.name).toBe('Bessie')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ISOLATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Auth isolation', () => {
  it('same username in Farm A and Farm B are independent', async () => {
    const sharedName = `shared_${randomUUID().slice(0, 6)}`
    await seedFarmUser(db, farmAId, { username: sharedName, password: 'passA' })
    await seedFarmUser(db, farmBId, { username: sharedName, password: 'passB' })

    const resA = await request(app)
      .post('/api/auth/login')
      .send({ username: sharedName, password: 'passA', farm_code: 'FARMA' })
    expect(resA.status).toBe(200)
    expect(resA.body.user.farm_id).toBe(farmAId)

    const resB = await request(app)
      .post('/api/auth/login')
      .send({ username: sharedName, password: 'passB', farm_code: 'FARMB' })
    expect(resB.status).toBe(200)
    expect(resB.body.user.farm_id).toBe(farmBId)

    // Cross-farm password should fail
    const resCross = await request(app)
      .post('/api/auth/login')
      .send({ username: sharedName, password: 'passB', farm_code: 'FARMA' })
    expect(resCross.status).toBe(401)
  })

  it('Farm A admin cannot log in with Farm B farm code', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin_a', password: 'pass123', farm_code: 'FARMB' })
    expect(res.status).toBe(401)
  })

  it('deactivated farm rejects login', async () => {
    const deadFarmId = await seedFarm(db, 'DEAD', 'Dead Farm')
    await seedFarmUser(db, deadFarmId, { username: 'dead_admin', password: 'pass123' })
    await db('farms').where({ id: deadFarmId }).update({ is_active: false })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'dead_admin', password: 'pass123', farm_code: 'DEAD' })
    expect(res.status).toBe(401)
  })

  it('PIN login requires farm code and is farm-scoped', async () => {
    const pinUser = `pin_${randomUUID().slice(0, 6)}`
    await seedFarmUser(db, farmAId, { username: pinUser, pin: '9999', role: 'worker' })

    // PIN login without farm code should fail (400 validation)
    const res1 = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: pinUser, pin: '9999' })
    expect(res1.status).toBe(400)

    // PIN login with correct farm code should work
    const res2 = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: pinUser, pin: '9999', farm_code: 'FARMA' })
    expect(res2.status).toBe(200)
    expect(res2.body.user.farm_id).toBe(farmAId)

    // PIN login with wrong farm code should fail
    const res3 = await request(app)
      .post('/api/auth/login-pin')
      .send({ username: pinUser, pin: '9999', farm_code: 'FARMB' })
    expect(res3.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('empty farm (Farm C) — cows list returns empty, not error', async () => {
    const res = await request(app).get('/api/cows').set('Authorization', farmCToken)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('empty farm — analytics herd-summary returns zeros', async () => {
    const res = await request(app)
      .get('/api/analytics/herd-summary')
      .set('Authorization', farmCToken)
    expect(res.status).toBe(200)
    expect(Number(res.body.total)).toBe(0)
  })

  it('empty farm — export returns empty tables', async () => {
    const res = await request(app).get('/api/export').set('Authorization', farmCToken)
    expect(res.status).toBe(200)
    expect(res.body.tables.cows.length).toBe(0)
  })

  it('deactivated user JWT returns 401', async () => {
    const tempUserId = await seedFarmUser(db, farmAId, {
      username: 'temp_user',
      password: 'pass123',
    })
    const tempToken = tokenForFarm(farmAId, tempUserId)
    await db('users').where({ id: tempUserId }).update({ is_active: false })

    const res = await request(app).get('/api/cows').set('Authorization', tempToken)
    expect(res.status).toBe(401)
  })

  it('token version mismatch returns 401', async () => {
    const versionUser = await seedFarmUser(db, farmAId, {
      username: 'version_user',
      password: 'pass123',
    })
    const oldToken = tokenForFarm(farmAId, versionUser)
    await db('users').where({ id: versionUser }).update({ token_version: 1 })

    const res = await request(app).get('/api/cows').set('Authorization', oldToken)
    expect(res.status).toBe(401)
  })
})
