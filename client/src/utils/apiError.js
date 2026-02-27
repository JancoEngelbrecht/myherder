/**
 * Extract a user-readable error from an Axios error.
 * - If the server returned { error: "..." }, use that string directly
 * - For non-server errors (network, timeout, permission), return an i18n key
 *   prefixed with "errors." that callers resolve via t()
 */
export function extractApiError(err) {
  // Server returned a structured error body — use as-is
  if (err.response?.data?.error) return err.response.data.error

  // Network/timeout — return i18n key
  if (err.code === 'ECONNABORTED' || !err.response) return 'errors.network'

  // HTTP status without structured body — return i18n key
  const status = err.response?.status
  if (status === 403) return 'errors.permissionDenied'
  if (status === 404) return 'errors.notFound'
  if (status >= 500) return 'errors.server'

  return 'errors.generic'
}

/**
 * Resolve an error string that may be an i18n key or a plain message.
 * If it starts with "errors.", it's an i18n key — resolve via t().
 * Otherwise, return as-is (server-provided message).
 */
export function resolveError(keyOrMessage, t) {
  if (keyOrMessage && keyOrMessage.startsWith('errors.')) return t(keyOrMessage)
  return keyOrMessage
}
