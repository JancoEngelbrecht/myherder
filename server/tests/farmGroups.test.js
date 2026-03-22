const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { jwtSecret } = require('../config/env')
const { seedUsers, seedFarm, seedFarmUser, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken, workerToken, superAdminToken, SUPER_ADMIN_ID } = require('./helpers/tokens')

// ── Helpers ────────────────────────────────────────────────────

async function insertGroup(name) {
  const { randomUUID } = require('crypto')
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('farm_groups').insert({ id, name, created_at: now, updated_at: now })
  return id
}

async function insertMember(groupId, farmId) {
  const { randomUUID } = require('crypto')
  await db('farm_group_members').insert({
    id: randomUUID(),
    farm_group_id: groupId,
    farm_id: farmId,
    added_at: new Date().toISOString(),
  })
}

// Build a Bearer token for a user on a specific farm
function farmToken(farmId, userId, { role = 'admin', username = 'sipho' } = {}) {
  const payload = {
    id: userId,
    farm_id: farmId,
    username,
    full_name: 'Test User',
    role,
    permissions: [],
    language: 'en',
    token_version: 0,
  }
  return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
}

// ── Setup / teardown ───────────────────────────────────────────

beforeAll(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  await db.raw('PRAGMA foreign_keys = OFF')
  await db('audit_log').del()
  await db('farm_group_members').del()
  await db('farm_groups').del()
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

// ── GET /api/farm-groups ──────────────────────────────────────

describe('GET /api/farm-groups', () => {
  it('returns empty array initially', async () => {
    const res = await request(app)
      .get('/api/farm-groups')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns groups with their member farms after creation', async () => {
    const farmAId = await seedFarm(db, 'GRPA', 'Group Farm A')
    const farmBId = await seedFarm(db, 'GRPB', 'Group Farm B')
    const groupId = await insertGroup('Eastern Cape')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)

    const res = await request(app)
      .get('/api/farm-groups')
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe(groupId)
    expect(res.body[0].name).toBe('Eastern Cape')
    expect(res.body[0].farms).toHaveLength(2)
    const farmIds = res.body[0].farms.map((f) => f.id)
    expect(farmIds).toContain(farmAId)
    expect(farmIds).toContain(farmBId)
  })

  it('rejects non-super-admin (admin token)', async () => {
    const res = await request(app)
      .get('/api/farm-groups')
      .set('Authorization', adminToken())
    expect(res.status).toBe(403)
  })

  it('rejects worker token', async () => {
    const res = await request(app)
      .get('/api/farm-groups')
      .set('Authorization', workerToken())
    expect(res.status).toBe(403)
  })
})

// ── POST /api/farm-groups ─────────────────────────────────────

describe('POST /api/farm-groups', () => {
  it('creates a group with 2 farms', async () => {
    const farmAId = await seedFarm(db, 'CRPA', 'Create Farm A')
    const farmBId = await seedFarm(db, 'CRPB', 'Create Farm B')

    const res = await request(app)
      .post('/api/farm-groups')
      .set('Authorization', superAdminToken())
      .send({ name: 'Southern Group', farm_ids: [farmAId, farmBId] })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Southern Group')
    expect(res.body.farms).toHaveLength(2)
    const farmIds = res.body.farms.map((f) => f.id)
    expect(farmIds).toContain(farmAId)
    expect(farmIds).toContain(farmBId)
  })

  it('rejects fewer than 2 farms (400)', async () => {
    const farmAId = await seedFarm(db, 'ONE1', 'One Farm')

    const res = await request(app)
      .post('/api/farm-groups')
      .set('Authorization', superAdminToken())
      .send({ name: 'Solo Group', farm_ids: [farmAId] })

    expect(res.status).toBe(400)
  })

  it('rejects a farm that is already in a group (409)', async () => {
    const farmAId = await seedFarm(db, 'DPA1', 'Dup Farm A')
    const farmBId = await seedFarm(db, 'DPB1', 'Dup Farm B')
    const farmCId = await seedFarm(db, 'DPC1', 'Dup Farm C')

    // Put farmA + farmB in an existing group
    const groupId = await insertGroup('Existing Group')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)

    // Try to create a new group that includes the already-assigned farmA
    const res = await request(app)
      .post('/api/farm-groups')
      .set('Authorization', superAdminToken())
      .send({ name: 'Conflict Group', farm_ids: [farmAId, farmCId] })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already in a group/i)
  })

  it('rejects non-existent farm_ids (400)', async () => {
    const farmAId = await seedFarm(db, 'REA1', 'Real Farm A')
    const fakeFarmId = '00000000-0000-4000-a000-000000000999'

    const res = await request(app)
      .post('/api/farm-groups')
      .set('Authorization', superAdminToken())
      .send({ name: 'Bad Group', farm_ids: [farmAId, fakeFarmId] })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not found/i)
  })

  it('rejects empty body (400)', async () => {
    const res = await request(app)
      .post('/api/farm-groups')
      .set('Authorization', superAdminToken())
      .send({})

    expect(res.status).toBe(400)
  })

  it('rejects non-super-admin (403)', async () => {
    const farmAId = await seedFarm(db, 'SEC1', 'Sec Farm A')
    const farmBId = await seedFarm(db, 'SEC2', 'Sec Farm B')

    const res = await request(app)
      .post('/api/farm-groups')
      .set('Authorization', adminToken())
      .send({ name: 'Denied', farm_ids: [farmAId, farmBId] })

    expect(res.status).toBe(403)
  })
})

// ── PATCH /api/farm-groups/:id ────────────────────────────────

describe('PATCH /api/farm-groups/:id', () => {
  it('updates the group name', async () => {
    const farmAId = await seedFarm(db, 'PTA1', 'Patch Farm A')
    const farmBId = await seedFarm(db, 'PTB1', 'Patch Farm B')
    const groupId = await insertGroup('Old Name')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)

    const res = await request(app)
      .patch(`/api/farm-groups/${groupId}`)
      .set('Authorization', superAdminToken())
      .send({ name: 'New Name' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New Name')
    expect(res.body.id).toBe(groupId)
  })

  it('returns 404 for a missing group', async () => {
    const res = await request(app)
      .patch('/api/farm-groups/00000000-0000-4000-a000-000000000000')
      .set('Authorization', superAdminToken())
      .send({ name: 'Ghost' })

    expect(res.status).toBe(404)
  })

  it('rejects non-super-admin (403)', async () => {
    const groupId = await insertGroup('Blocked Group')

    const res = await request(app)
      .patch(`/api/farm-groups/${groupId}`)
      .set('Authorization', adminToken())
      .send({ name: 'Hacked' })

    expect(res.status).toBe(403)
  })
})

// ── DELETE /api/farm-groups/:id ───────────────────────────────

describe('DELETE /api/farm-groups/:id', () => {
  it('deletes the group and removes all member rows', async () => {
    const farmAId = await seedFarm(db, 'DLA1', 'Del Farm A')
    const farmBId = await seedFarm(db, 'DLB1', 'Del Farm B')
    const groupId = await insertGroup('Deletable Group')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)

    const res = await request(app)
      .delete(`/api/farm-groups/${groupId}`)
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/deleted/i)

    // Verify the group and members are gone
    const group = await db('farm_groups').where('id', groupId).first()
    expect(group).toBeUndefined()

    const members = await db('farm_group_members').where('farm_group_id', groupId)
    expect(members).toHaveLength(0)
  })

  it('returns 404 for a non-existent group', async () => {
    const res = await request(app)
      .delete('/api/farm-groups/00000000-0000-4000-a000-000000000000')
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(404)
  })

  it('rejects non-super-admin (403)', async () => {
    const groupId = await insertGroup('Protected Group')

    const res = await request(app)
      .delete(`/api/farm-groups/${groupId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(403)
  })
})

// ── POST /api/farm-groups/:id/farms ───────────────────────────

describe('POST /api/farm-groups/:id/farms', () => {
  it('adds a farm to an existing group', async () => {
    const farmAId = await seedFarm(db, 'ADA1', 'Add Farm A')
    const farmBId = await seedFarm(db, 'ADB1', 'Add Farm B')
    const farmCId = await seedFarm(db, 'ADC1', 'Add Farm C')

    const groupId = await insertGroup('Expandable Group')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)

    const res = await request(app)
      .post(`/api/farm-groups/${groupId}/farms`)
      .set('Authorization', superAdminToken())
      .send({ farm_ids: [farmCId] })

    expect(res.status).toBe(200)
    expect(res.body.farms).toHaveLength(3)
    const farmIds = res.body.farms.map((f) => f.id)
    expect(farmIds).toContain(farmCId)
  })

  it('rejects a farm that is already in another group (409)', async () => {
    const farmAId = await seedFarm(db, 'CFA1', 'Conflict Farm A')
    const farmBId = await seedFarm(db, 'CFB1', 'Conflict Farm B')
    const farmCId = await seedFarm(db, 'CFC1', 'Conflict Farm C')
    const farmDId = await seedFarm(db, 'CFD1', 'Conflict Farm D')

    // Group 1: farmA + farmB
    const group1Id = await insertGroup('Group One')
    await insertMember(group1Id, farmAId)
    await insertMember(group1Id, farmBId)

    // Group 2: farmC + farmD (farmC already assigned)
    const group2Id = await insertGroup('Group Two')
    await insertMember(group2Id, farmCId)
    await insertMember(group2Id, farmDId)

    // Try to add farmC (from group 2) into group 1
    const res = await request(app)
      .post(`/api/farm-groups/${group1Id}/farms`)
      .set('Authorization', superAdminToken())
      .send({ farm_ids: [farmCId] })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already in a group/i)
  })

  it('returns 404 for a non-existent group', async () => {
    const farmAId = await seedFarm(db, 'NFG1', 'No Group Farm')

    const res = await request(app)
      .post('/api/farm-groups/00000000-0000-4000-a000-000000000000/farms')
      .set('Authorization', superAdminToken())
      .send({ farm_ids: [farmAId] })

    expect(res.status).toBe(404)
  })

  it('rejects non-super-admin (403)', async () => {
    const farmAId = await seedFarm(db, 'BFA1', 'Blocked Farm A')
    const farmBId = await seedFarm(db, 'BFB1', 'Blocked Farm B')
    const groupId = await insertGroup('Secure Group')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)

    const farmCId = await seedFarm(db, 'BFC1', 'Blocked Farm C')
    const res = await request(app)
      .post(`/api/farm-groups/${groupId}/farms`)
      .set('Authorization', adminToken())
      .send({ farm_ids: [farmCId] })

    expect(res.status).toBe(403)
  })
})

// ── DELETE /api/farm-groups/:id/farms/:farmId ─────────────────

describe('DELETE /api/farm-groups/:id/farms/:farmId', () => {
  it('removes a farm from a group (3 members → 2, group survives)', async () => {
    const farmAId = await seedFarm(db, 'RMA1', 'Remove Farm A')
    const farmBId = await seedFarm(db, 'RMB1', 'Remove Farm B')
    const farmCId = await seedFarm(db, 'RMC1', 'Remove Farm C')

    const groupId = await insertGroup('Three-Farm Group')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)
    await insertMember(groupId, farmCId)

    const res = await request(app)
      .delete(`/api/farm-groups/${groupId}/farms/${farmCId}`)
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(200)
    // Group still exists with 2 remaining members
    expect(res.body.farms).toHaveLength(2)
    const remaining = res.body.farms.map((f) => f.id)
    expect(remaining).not.toContain(farmCId)
  })

  it('auto-deletes group when removing a farm leaves only 1 member', async () => {
    const farmAId = await seedFarm(db, 'ADA2', 'Auto Del Farm A')
    const farmBId = await seedFarm(db, 'ADB2', 'Auto Del Farm B')

    const groupId = await insertGroup('Two-Farm Group')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)

    const res = await request(app)
      .delete(`/api/farm-groups/${groupId}/farms/${farmBId}`)
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/group deleted/i)

    // Confirm group is gone
    const group = await db('farm_groups').where('id', groupId).first()
    expect(group).toBeUndefined()
  })

  it('returns 404 when the farm is not in the group', async () => {
    const farmAId = await seedFarm(db, 'NIG1', 'Not In Group Farm A')
    const farmBId = await seedFarm(db, 'NIG2', 'Not In Group Farm B')
    const farmCId = await seedFarm(db, 'NIG3', 'Not In Group Farm C')

    const groupId = await insertGroup('Small Group')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)

    const res = await request(app)
      .delete(`/api/farm-groups/${groupId}/farms/${farmCId}`)
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(404)
  })

  it('returns 404 when the group does not exist', async () => {
    const farmAId = await seedFarm(db, 'NGD1', 'No Group Farm')

    const res = await request(app)
      .delete(`/api/farm-groups/00000000-0000-4000-a000-000000000000/farms/${farmAId}`)
      .set('Authorization', superAdminToken())

    expect(res.status).toBe(404)
  })

  it('rejects non-super-admin (403)', async () => {
    const farmAId = await seedFarm(db, 'SCA1', 'Secure A')
    const farmBId = await seedFarm(db, 'SCB1', 'Secure B')
    const farmCId = await seedFarm(db, 'SCC1', 'Secure C')

    const groupId = await insertGroup('Secure Remove Group')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)
    await insertMember(groupId, farmCId)

    const res = await request(app)
      .delete(`/api/farm-groups/${groupId}/farms/${farmCId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(403)
  })
})

// ── GET /api/auth/my-farms — group filtering ─────────────────

describe('GET /api/auth/my-farms — farm group filtering', () => {
  let farmAId, farmBId, farmCId
  let userAId, userCId

  beforeEach(async () => {
    // Seed 3 farms
    farmAId = await seedFarm(db, 'MFA1', 'My Farm A')
    farmBId = await seedFarm(db, 'MFB1', 'My Farm B')
    farmCId = await seedFarm(db, 'MFC1', 'My Farm C')

    // Seed user "sipho" on all 3 farms
    userAId = await seedFarmUser(db, farmAId, { username: 'sipho', password: 'pass1' })
    await seedFarmUser(db, farmBId, { username: 'sipho', password: 'pass1' })
    userCId = await seedFarmUser(db, farmCId, { username: 'sipho', password: 'pass1' })

    // Group: farmA + farmB (NOT farmC)
    const groupId = await insertGroup('AB Group')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)
  })

  it('returns only group-member farms when current farm is in a group', async () => {
    // Token for farm A — should see [A, B] but not C
    const token = farmToken(farmAId, userAId, { username: 'sipho' })
    const res = await request(app)
      .get('/api/auth/my-farms')
      .set('Authorization', token)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    const ids = res.body.map((f) => f.id)
    expect(ids).toContain(farmAId)
    expect(ids).toContain(farmBId)
    expect(ids).not.toContain(farmCId)
  })

  it('returns empty array when current farm is not in any group', async () => {
    // Token for farm C — C is not in any group
    const token = farmToken(farmCId, userCId, { username: 'sipho' })
    const res = await request(app)
      .get('/api/auth/my-farms')
      .set('Authorization', token)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns only farms where the user has an account within the group', async () => {
    // Seed a 4th farm in the AB group, but sipho has NO account there
    const farmDId = await seedFarm(db, 'MFD1', 'My Farm D')
    const groupId = await db('farm_group_members').where('farm_id', farmAId).select('farm_group_id').first()
    await insertMember(groupId.farm_group_id, farmDId)

    // Token for farm A — should see [A, B] but NOT D (no sipho account on D)
    const token = farmToken(farmAId, userAId, { username: 'sipho' })
    const res = await request(app)
      .get('/api/auth/my-farms')
      .set('Authorization', token)

    expect(res.status).toBe(200)
    const ids = res.body.map((f) => f.id)
    expect(ids).toContain(farmAId)
    expect(ids).toContain(farmBId)
    expect(ids).not.toContain(farmDId)
  })
})

// ── POST /api/auth/switch-farm — group verification ──────────

describe('POST /api/auth/switch-farm — group verification', () => {
  let farmAId, farmBId, farmCId
  let userAId, userCId

  beforeEach(async () => {
    farmAId = await seedFarm(db, 'SWA1', 'Switch Farm A')
    farmBId = await seedFarm(db, 'SWB1', 'Switch Farm B')
    farmCId = await seedFarm(db, 'SWC1', 'Switch Farm C')

    userAId = await seedFarmUser(db, farmAId, { username: 'sipho', password: 'pass1' })
    await seedFarmUser(db, farmBId, { username: 'sipho', password: 'pass1' })
    userCId = await seedFarmUser(db, farmCId, { username: 'sipho', password: 'pass1' })

    // Group: farmA + farmB only
    const groupId = await insertGroup('Switch Group')
    await insertMember(groupId, farmAId)
    await insertMember(groupId, farmBId)
  })

  it('allows switching to farmB from farmA (same group) — returns 200 with token', async () => {
    const token = farmToken(farmAId, userAId, { username: 'sipho' })
    const res = await request(app)
      .post(`/api/auth/switch-farm/${farmBId}`)
      .set('Authorization', token)

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.farm.id).toBe(farmBId)
  })

  it('rejects switching to farmC from farmA (different group / C not in group) — returns 403', async () => {
    const token = farmToken(farmAId, userAId, { username: 'sipho' })
    const res = await request(app)
      .post(`/api/auth/switch-farm/${farmCId}`)
      .set('Authorization', token)

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/not in the same group/i)
  })

  it('rejects switching from farmC (not in any group) to farmA — returns 403', async () => {
    const token = farmToken(farmCId, userCId, { username: 'sipho' })
    const res = await request(app)
      .post(`/api/auth/switch-farm/${farmAId}`)
      .set('Authorization', token)

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/not in the same group/i)
  })

  it('creates an audit log entry on successful switch', async () => {
    const token = farmToken(farmAId, userAId, { username: 'sipho' })
    await request(app)
      .post(`/api/auth/switch-farm/${farmBId}`)
      .set('Authorization', token)
      .expect(200)

    const entry = await db('audit_log')
      .where({ action: 'switch_farm', entity_type: 'farm', entity_id: farmBId })
      .first()

    expect(entry).toBeDefined()
    expect(entry.user_id).toBe(userAId)
  })
})
