// Sets req.farmId from JWT.
// Super-admin with no farm context gets farmId = null.
// Any non-super-admin missing farm_id is rejected with 401.
import type { Request, Response, NextFunction } from 'express'

module.exports = function tenantScope(req: Request, res: Response, next: NextFunction): void {
  const { farm_id, role } = req.user!

  if (role === 'super_admin') {
    req.farmId = farm_id ?? null
  } else if (!farm_id) {
    res.status(401).json({ error: 'Missing farm context' })
    return
  } else {
    req.farmId = farm_id
  }

  next()
}
