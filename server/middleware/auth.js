const jwt = require('jsonwebtoken')
const db = require('../config/database')
const { jwtSecret } = require('../config/env')

module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = header.slice(7)
  let decoded
  try {
    decoded = jwt.verify(token, jwtSecret)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Temp tokens (2FA flow) cannot access regular endpoints
  if (decoded.type === 'temp') {
    return res.status(401).json({ error: 'Temporary token not valid for this endpoint' })
  }

  req.user = decoded

  // Verify token_version against DB (catches revoked sessions)
  try {
    const user = await db('users')
      .where('id', decoded.id)
      .select('token_version', 'is_active')
      .first()
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' })
    }
    if (typeof decoded.token_version !== 'number' || decoded.token_version !== user.token_version) {
      return res.status(401).json({ error: 'Token revoked' })
    }
    next()
  } catch (err) {
    next(err)
  }
}
