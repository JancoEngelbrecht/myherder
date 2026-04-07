import jwt from 'jsonwebtoken'
import db from '../config/database'
import { jwtSecret } from '../config/env'
import type { Request, Response, NextFunction } from 'express'

module.exports = async function auth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  const token = header.slice(7)
  let decoded: any
  try {
    decoded = jwt.verify(token, jwtSecret)
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  // Temp tokens (2FA flow) cannot access regular endpoints
  if (decoded.type === 'temp') {
    res.status(401).json({ error: 'Temporary token not valid for this endpoint' })
    return
  }

  req.user = decoded

  // Verify token_version against DB (catches revoked sessions)
  try {
    const user = await db('users')
      .where('id', decoded.id)
      .select('token_version', 'is_active')
      .first()
    if (!user || !user.is_active) {
      res.status(401).json({ error: 'User not found or inactive' })
      return
    }
    if (typeof decoded.token_version !== 'number' || decoded.token_version !== user.token_version) {
      res.status(401).json({ error: 'Token revoked' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}
