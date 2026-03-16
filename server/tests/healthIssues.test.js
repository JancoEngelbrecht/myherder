const { randomUUID } = require('crypto')
const request = require('supertest')
const app = require('../app')
const db = require('../config/database')
const { seedUsers, DEFAULT_FARM_ID } = require('./helpers/setup')
const { adminToken, workerToken, workerTokenWith } = require('./helpers/tokens')

beforeAll(async () => {
  await db.migrate.latest()
  await seedUsers(db)
})

afterAll(() => db.destroy())

// ─── Factories ─────────────────────────────────────────────────────────────────

async function createCow(overrides = {}) {
  const id = randomUUID()
  await db('cows').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    tag_number: `HI-${id.slice(0, 6)}`,
    sex: 'female',
    status: 'active',
    ...overrides,
  })
  return id
}

async function createIssue(cowId, overrides = {}) {
  const adminId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
  const id = randomUUID()
  const now = new Date().toISOString()
  await db('health_issues').insert({
    id,
    farm_id: DEFAULT_FARM_ID,
    cow_id: cowId,
    reported_by: adminId,
    issue_types: JSON.stringify(['mastitis']),
    severity: 'medium',
    affected_teats: null,
    description: null,
    observed_at: now,
    status: 'open',
    created_at: now,
    updated_at: now,
    ...overrides,
  })
  return id
}

function postIssue(body) {
  return request(app).post('/api/health-issues').set('Authorization', adminToken()).send(body)
}

// ─── GET /api/health-issues ────────────────────────────────────────────────────

describe('GET /api/health-issues', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/health-issues')
    expect(res.status).toBe(401)
  })

  it('returns an array of issues with cow and user names', async () => {
    const cowId = await createCow()
    await createIssue(cowId)

    const res = await request(app).get('/api/health-issues').set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // Issues include joined cow/user fields
    const issue = res.body.find((i) => i.cow_id === cowId)
    expect(issue).toBeDefined()
    expect(issue.tag_number).toBeDefined()
    expect(issue.reported_by_name).toBeDefined()
    // JSON columns are parsed
    expect(Array.isArray(issue.issue_types)).toBe(true)
  })

  it('filters by cow_id', async () => {
    const cow1 = await createCow()
    const cow2 = await createCow()
    await createIssue(cow1)
    await createIssue(cow2)

    const res = await request(app)
      .get(`/api/health-issues?cow_id=${cow1}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.every((i) => i.cow_id === cow1)).toBe(true)
  })

  it('filters by status', async () => {
    const cowId = await createCow()
    const now = new Date().toISOString()
    await createIssue(cowId, { status: 'resolved', resolved_at: now })
    await createIssue(cowId, { status: 'open' })

    const res = await request(app)
      .get('/api/health-issues?status=resolved')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.every((i) => i.status === 'resolved')).toBe(true)
  })

  it('sets X-Total-Count header', async () => {
    const res = await request(app).get('/api/health-issues').set('Authorization', adminToken())
    expect(res.headers['x-total-count']).toBeDefined()
    expect(Number(res.headers['x-total-count'])).toBeGreaterThanOrEqual(0)
  })

  it('paginates results when page param is provided', async () => {
    const cowId = await createCow()
    for (let i = 0; i < 3; i++) await createIssue(cowId)

    const res = await request(app)
      .get('/api/health-issues?page=1&limit=2')
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeLessThanOrEqual(2)
    expect(Number(res.headers['x-total-count'])).toBeGreaterThanOrEqual(3)
  })
})

// ─── GET /api/health-issues/:id ────────────────────────────────────────────────

describe('GET /api/health-issues/:id', () => {
  it('returns the issue with parsed JSON fields', async () => {
    const cowId = await createCow()
    const now = new Date().toISOString()
    const issueId = await createIssue(cowId, {
      issue_types: JSON.stringify(['mastitis', 'lameness']),
      affected_teats: JSON.stringify(['front_left', 'rear_right']),
      severity: 'high',
      description: 'Swollen teat',
      observed_at: now,
    })

    const res = await request(app)
      .get(`/api/health-issues/${issueId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(issueId)
    expect(Array.isArray(res.body.issue_types)).toBe(true)
    expect(res.body.issue_types).toContain('mastitis')
    expect(Array.isArray(res.body.affected_teats)).toBe(true)
    expect(res.body.affected_teats).toContain('front_left')
    expect(res.body.severity).toBe('high')
    expect(res.body.description).toBe('Swollen teat')
  })

  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app)
      .get(`/api/health-issues/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })
})

// ─── POST /api/health-issues ───────────────────────────────────────────────────

describe('POST /api/health-issues', () => {
  it('creates an issue and returns 201 with parsed fields', async () => {
    const cowId = await createCow()

    const res = await postIssue({
      cow_id: cowId,
      issue_types: ['mastitis'],
      severity: 'high',
      observed_at: '2026-01-10T08:00:00.000Z',
    })

    expect(res.status).toBe(201)
    expect(res.body.cow_id).toBe(cowId)
    expect(Array.isArray(res.body.issue_types)).toBe(true)
    expect(res.body.issue_types).toContain('mastitis')
    expect(res.body.severity).toBe('high')
    expect(res.body.status).toBe('open')
    expect(res.body.tag_number).toBeDefined()
    expect(res.body.reported_by_name).toBeDefined()
  })

  it('creates an issue with affected teats', async () => {
    const cowId = await createCow()

    const res = await postIssue({
      cow_id: cowId,
      issue_types: ['mastitis'],
      affected_teats: ['front_left', 'rear_right'],
      observed_at: '2026-01-10T08:00:00.000Z',
    })

    expect(res.status).toBe(201)
    expect(Array.isArray(res.body.affected_teats)).toBe(true)
    expect(res.body.affected_teats).toContain('front_left')
    expect(res.body.affected_teats).toContain('rear_right')
  })

  it('creates an issue with multiple issue types', async () => {
    const cowId = await createCow()

    const res = await postIssue({
      cow_id: cowId,
      issue_types: ['mastitis', 'lameness'],
      observed_at: '2026-01-10T08:00:00.000Z',
    })

    expect(res.status).toBe(201)
    expect(res.body.issue_types).toHaveLength(2)
    expect(res.body.issue_types).toContain('lameness')
  })

  it('returns 400 for missing issue_types', async () => {
    const cowId = await createCow()
    const res = await postIssue({ cow_id: cowId, observed_at: '2026-01-10T08:00:00.000Z' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty issue_types array', async () => {
    const cowId = await createCow()
    const res = await postIssue({
      cow_id: cowId,
      issue_types: [],
      observed_at: '2026-01-10T08:00:00.000Z',
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid severity', async () => {
    const cowId = await createCow()
    const res = await postIssue({
      cow_id: cowId,
      issue_types: ['mastitis'],
      severity: 'critical',
      observed_at: '2026-01-10T08:00:00.000Z',
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid teat position', async () => {
    const cowId = await createCow()
    const res = await postIssue({
      cow_id: cowId,
      issue_types: ['mastitis'],
      affected_teats: ['invalid_teat'],
      observed_at: '2026-01-10T08:00:00.000Z',
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 for a nonexistent cow', async () => {
    const res = await postIssue({
      cow_id: randomUUID(),
      issue_types: ['mastitis'],
      observed_at: '2026-01-10T08:00:00.000Z',
    })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/cow/i)
  })

  it('returns 404 for a soft-deleted cow', async () => {
    const cowId = await createCow({ deleted_at: new Date().toISOString() })
    const res = await postIssue({
      cow_id: cowId,
      issue_types: ['mastitis'],
      observed_at: '2026-01-10T08:00:00.000Z',
    })
    expect(res.status).toBe(404)
  })
})

// ─── PATCH /api/health-issues/:id/status ──────────────────────────────────────

describe('PATCH /api/health-issues/:id/status', () => {
  it('updates status to treating', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId, { status: 'open' })

    const res = await request(app)
      .patch(`/api/health-issues/${issueId}/status`)
      .set('Authorization', adminToken())
      .send({ status: 'treating' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('treating')
  })

  it('sets resolved_at when status is changed to resolved', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId, { status: 'treating' })

    const res = await request(app)
      .patch(`/api/health-issues/${issueId}/status`)
      .set('Authorization', adminToken())
      .send({ status: 'resolved' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('resolved')
    // resolved_at should be set in the DB
    const row = await db('health_issues').where({ id: issueId }).first()
    expect(row.resolved_at).not.toBeNull()
  })

  it('returns 400 for an invalid status value', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)

    const res = await request(app)
      .patch(`/api/health-issues/${issueId}/status`)
      .set('Authorization', adminToken())
      .send({ status: 'closed' })

    expect(res.status).toBe(400)
  })

  it('returns 404 for a nonexistent issue', async () => {
    const res = await request(app)
      .patch(`/api/health-issues/${randomUUID()}/status`)
      .set('Authorization', adminToken())
      .send({ status: 'resolved' })

    expect(res.status).toBe(404)
  })

  it('a worker token can update status', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId, { status: 'open' })

    const res = await request(app)
      .patch(`/api/health-issues/${issueId}/status`)
      .set('Authorization', workerToken())
      .send({ status: 'treating' })

    expect(res.status).toBe(200)
  })
})

// ─── DELETE /api/health-issues/:id ────────────────────────────────────────────

describe('DELETE /api/health-issues/:id', () => {
  it('deletes the issue (admin only)', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)

    const res = await request(app)
      .delete(`/api/health-issues/${issueId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const row = await db('health_issues').where({ id: issueId }).first()
    expect(row).toBeUndefined()
  })

  it('deletes an issue that has comments', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)
    const adminId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const now = new Date().toISOString()
    await db('health_issue_comments').insert({
      id: randomUUID(),
      farm_id: DEFAULT_FARM_ID,
      health_issue_id: issueId,
      user_id: adminId,
      comment: 'Should be deleted too',
      created_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .delete(`/api/health-issues/${issueId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const comments = await db('health_issue_comments').where({ health_issue_id: issueId })
    expect(comments).toHaveLength(0)
  })

  it('returns 403 for a worker token', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)

    const res = await request(app)
      .delete(`/api/health-issues/${issueId}`)
      .set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })

  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app)
      .delete(`/api/health-issues/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })
})

// ─── Comments ─────────────────────────────────────────────────────────────────

describe('GET /api/health-issues/:id/comments', () => {
  it('returns an empty array when there are no comments', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)

    const res = await request(app)
      .get(`/api/health-issues/${issueId}/comments`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(0)
  })

  it('returns comments with author names in chronological order', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)
    const adminId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const now = new Date().toISOString()

    await db('health_issue_comments').insert([
      { id: randomUUID(), farm_id: DEFAULT_FARM_ID, health_issue_id: issueId, user_id: adminId, comment: 'First', created_at: '2026-01-01T10:00:00Z', updated_at: now },
      { id: randomUUID(), farm_id: DEFAULT_FARM_ID, health_issue_id: issueId, user_id: adminId, comment: 'Second', created_at: '2026-01-01T11:00:00Z', updated_at: now },
    ])

    const res = await request(app)
      .get(`/api/health-issues/${issueId}/comments`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].comment).toBe('First')
    expect(res.body[1].comment).toBe('Second')
    expect(res.body[0].author_name).toBeDefined()
  })
})

describe('POST /api/health-issues/:id/comments', () => {
  it('adds a comment and returns 201 with author name', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)

    const res = await request(app)
      .post(`/api/health-issues/${issueId}/comments`)
      .set('Authorization', adminToken())
      .send({ comment: 'Treated with penicillin' })

    expect(res.status).toBe(201)
    expect(res.body.comment).toBe('Treated with penicillin')
    expect(res.body.id).toBeDefined()
    expect(res.body.author_name).toBeDefined()
    expect(res.body.health_issue_id).toBe(issueId)
  })

  it('returns 400 for an empty comment', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)

    const res = await request(app)
      .post(`/api/health-issues/${issueId}/comments`)
      .set('Authorization', adminToken())
      .send({ comment: '' })

    expect(res.status).toBe(400)
  })

  it('returns 404 if the issue does not exist', async () => {
    const res = await request(app)
      .post(`/api/health-issues/${randomUUID()}/comments`)
      .set('Authorization', adminToken())
      .send({ comment: 'Ghost comment' })

    expect(res.status).toBe(404)
  })

  it('a worker token can add a comment', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)

    const res = await request(app)
      .post(`/api/health-issues/${issueId}/comments`)
      .set('Authorization', workerToken())
      .send({ comment: 'Worker observation' })

    expect(res.status).toBe(201)
  })
})

describe('DELETE /api/health-issues/:id/comments/:commentId', () => {
  it('deletes a comment (admin only)', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)
    const adminId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const commentId = randomUUID()
    const now = new Date().toISOString()
    await db('health_issue_comments').insert({
      id: commentId,
      farm_id: DEFAULT_FARM_ID,
      health_issue_id: issueId,
      user_id: adminId,
      comment: 'To be deleted',
      created_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .delete(`/api/health-issues/${issueId}/comments/${commentId}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(200)
    const row = await db('health_issue_comments').where({ id: commentId }).first()
    expect(row).toBeUndefined()
  })

  it('returns 403 for a worker token', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)
    const adminId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const commentId = randomUUID()
    const now = new Date().toISOString()
    await db('health_issue_comments').insert({
      id: commentId,
      farm_id: DEFAULT_FARM_ID,
      health_issue_id: issueId,
      user_id: adminId,
      comment: 'Worker cannot delete',
      created_at: now,
      updated_at: now,
    })

    const res = await request(app)
      .delete(`/api/health-issues/${issueId}/comments/${commentId}`)
      .set('Authorization', workerToken())

    expect(res.status).toBe(403)
  })

  it('returns 404 for a nonexistent comment', async () => {
    const cowId = await createCow()
    const issueId = await createIssue(cowId)

    const res = await request(app)
      .delete(`/api/health-issues/${issueId}/comments/${randomUUID()}`)
      .set('Authorization', adminToken())

    expect(res.status).toBe(404)
  })
})

// ─── Query Validation (12B.5) ───────────────────────────────────────────────

describe('GET /api/health-issues query validation', () => {
  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .get('/api/health-issues?status=invalid')
      .set('Authorization', adminToken())

    expect(res.status).toBe(400)
  })
})

describe('GET /api/health-issues permission enforcement', () => {
  it('returns 403 for worker without can_log_issues', async () => {
    const token = workerTokenWith([])
    const res = await request(app).get('/api/health-issues').set('Authorization', token)
    expect(res.status).toBe(403)
  })

  it('returns 403 for GET /:id/comments without can_log_issues', async () => {
    const token = workerTokenWith([])
    const res = await request(app).get('/api/health-issues/fake-id/comments').set('Authorization', token)
    expect(res.status).toBe(403)
  })
})
