const jwt = require('jsonwebtoken')
const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const { requireAdmin } = require('../middleware/authorize')

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod'

function mockRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

// ── auth middleware ─────────────────────────────────────────────────────────────

describe('auth middleware', () => {
  it('sets req.user and calls next() with valid Bearer token', () => {
    const payload = { id: 'u1', username: 'admin', role: 'admin', permissions: [] }
    const token = jwt.sign(payload, JWT_SECRET)
    const req = { headers: { authorization: `Bearer ${token}` } }
    const res = mockRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.user).toBeDefined()
    expect(req.user.username).toBe('admin')
  })

  it('returns 401 when Authorization header is missing', () => {
    const req = { headers: {} }
    const res = mockRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header is not Bearer format', () => {
    const req = { headers: { authorization: 'Basic abc123' } }
    const res = mockRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 for invalid token', () => {
    const req = { headers: { authorization: 'Bearer invalid.token.here' } }
    const res = mockRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 for expired token', () => {
    const payload = { id: 'u1', username: 'admin', role: 'admin' }
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' })
    const req = { headers: { authorization: `Bearer ${token}` } }
    const res = mockRes()
    const next = jest.fn()

    auth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})

// ── authorize middleware ────────────────────────────────────────────────────────

describe('authorize middleware', () => {
  it('admin role bypasses permission check', () => {
    const req = { user: { role: 'admin', permissions: [] } }
    const res = mockRes()
    const next = jest.fn()

    authorize('can_log_issues')(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('worker with matching permission passes', () => {
    const req = { user: { role: 'worker', permissions: ['can_log_issues'] } }
    const res = mockRes()
    const next = jest.fn()

    authorize('can_log_issues')(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('worker without matching permission gets 403', () => {
    const req = { user: { role: 'worker', permissions: ['can_record_milk'] } }
    const res = mockRes()
    const next = jest.fn()

    authorize('can_log_issues')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when req.user is missing', () => {
    const req = {}
    const res = mockRes()
    const next = jest.fn()

    authorize('can_log_issues')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})

// ── requireAdmin ────────────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('admin role passes', () => {
    const req = { user: { role: 'admin' } }
    const res = mockRes()
    const next = jest.fn()

    requireAdmin(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('worker role gets 403', () => {
    const req = { user: { role: 'worker' } }
    const res = mockRes()
    const next = jest.fn()

    requireAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' })
    expect(next).not.toHaveBeenCalled()
  })
})
