function authorize(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    if (req.user.role === 'admin' || req.user.role === 'super_admin') return next()

    const permissions = req.user.permissions || []
    if (permissions.includes(permission)) return next()

    return res.status(403).json({ error: 'Insufficient permissions' })
  }
}

function requireAdmin(req, res, next) {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) return next()
  return res.status(403).json({ error: 'Admin access required' })
}

module.exports = authorize
module.exports.requireAdmin = requireAdmin
