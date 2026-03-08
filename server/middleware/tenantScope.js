// Sets req.farmId from JWT.
// Super-admin with no farm context gets farmId = null.
// Any non-super-admin missing farm_id is rejected with 401.
module.exports = function tenantScope(req, res, next) {
  const { farm_id, role } = req.user

  if (role === 'super_admin') {
    req.farmId = farm_id ?? null
  } else if (!farm_id) {
    return res.status(401).json({ error: 'Missing farm context' })
  } else {
    req.farmId = farm_id
  }

  next()
}
