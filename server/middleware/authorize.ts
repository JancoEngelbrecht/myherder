import type { Request, Response, NextFunction, RequestHandler } from 'express'

function authorize(permission: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      next()
      return
    }

    const permissions = req.user.permissions || []
    if (permissions.includes(permission)) {
      next()
      return
    }

    res.status(403).json({ error: 'Insufficient permissions' })
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
    next()
    return
  }
  res.status(403).json({ error: 'Admin access required' })
}

module.exports = authorize
module.exports.requireAdmin = requireAdmin
