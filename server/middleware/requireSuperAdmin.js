module.exports = function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' })
  }
  // Reject super-admin in farm context (farm-scoped JWT has farm_id set)
  if (req.user.farm_id) {
    return res.status(403).json({ error: 'Exit farm context before accessing super admin panel' })
  }
  next()
}
