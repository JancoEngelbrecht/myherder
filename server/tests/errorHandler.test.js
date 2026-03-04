const errorHandler = require('../middleware/errorHandler')

function mockRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

const noop = () => {}

describe('errorHandler', () => {
  it('SQLite UNIQUE constraint error returns 409', () => {
    const err = { code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'UNIQUE constraint failed' }
    const res = mockRes()

    errorHandler(err, {}, res, noop)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ error: 'A record with that value already exists' })
  })

  it('MySQL ER_DUP_ENTRY error returns 409', () => {
    const err = { code: 'ER_DUP_ENTRY', message: 'Duplicate entry' }
    const res = mockRes()

    errorHandler(err, {}, res, noop)

    expect(res.status).toHaveBeenCalledWith(409)
  })

  it('error with UNIQUE in message returns 409', () => {
    const err = { message: 'UNIQUE constraint failed: users.username' }
    const res = mockRes()

    errorHandler(err, {}, res, noop)

    expect(res.status).toHaveBeenCalledWith(409)
  })

  it('Joi validation error with status 400 returns 400', () => {
    const err = { status: 400, message: '"username" is required' }
    const res = mockRes()

    errorHandler(err, {}, res, noop)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'username is required' })
  })

  it('generic error in production returns 500 without leak', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const err = { message: 'Sensitive internal details' }
    const res = mockRes()

    errorHandler(err, {}, res, noop)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    process.env.NODE_ENV = prev
  })

  it('generic error in dev returns 500 with actual message', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const err = { message: 'Something broke' }
    const res = mockRes()

    errorHandler(err, {}, res, noop)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Something broke' })
    process.env.NODE_ENV = prev
  })
})
