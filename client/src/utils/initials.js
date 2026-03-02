/**
 * Compute user initials from full name or username.
 * Returns max 2 uppercase letters.
 */
export function getInitials(user) {
  const name = user?.full_name
  if (name) {
    return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  }
  const username = user?.username
  return username ? username.slice(0, 2).toUpperCase() : '?'
}
