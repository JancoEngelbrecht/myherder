import type { Request, Response, NextFunction } from 'express'

module.exports = function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Super admin access required' })
    return
  }
  // Reject super-admin in farm context (farm-scoped JWT has farm_id set)
  if (req.user.farm_id) {
    res.status(403).json({ error: 'Exit farm context before accessing super admin panel' })
    return
  }
  next()
}
