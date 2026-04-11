export const DERIVED_SESSIONS = ['morning', 'afternoon', 'evening'] as const
export type DerivedSession = (typeof DERIVED_SESSIONS)[number]

/**
 * Derive a milk session bucket from a `HH:MM` time string.
 *
 *   00:00–10:59 → morning
 *   11:00–15:59 → afternoon
 *   16:00–23:59 → evening
 *
 * Malformed or empty input falls back to `'morning'` so callers never get
 * an invalid session value that would be rejected by the backend Joi schema.
 */
export function deriveSession(timeStr: string | null | undefined): DerivedSession {
  if (!timeStr || !/^\d{2}:\d{2}/.test(timeStr)) return 'morning'
  const h = Number(timeStr.slice(0, 2))
  if (!Number.isFinite(h) || h < 0 || h > 23) return 'morning'
  if (h < 11) return 'morning'
  if (h < 16) return 'afternoon'
  return 'evening'
}
