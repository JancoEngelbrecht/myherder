// Fixed breeding event workflow types — not configurable.
// Names are resolved via i18n key `breeding.eventTypes.<code>`.
export const BREEDING_EVENT_TYPES = [
  { code: 'heat_observed', emoji: '🔥', sort: 0 },
  { code: 'ai_insemination', emoji: '🧬', sort: 1 },
  { code: 'bull_service', emoji: '🐂', sort: 2 },
  { code: 'preg_check_positive', emoji: '✅', sort: 3 },
  { code: 'preg_check_negative', emoji: '❌', sort: 4 },
  { code: 'calving', emoji: '🐮', sort: 5 },
  { code: 'abortion', emoji: '⚠️', sort: 6 },
  { code: 'dry_off', emoji: '🌿', sort: 7 },
]

const byCode = Object.fromEntries(BREEDING_EVENT_TYPES.map((t) => [t.code, t]))

export function getEventType(code) {
  return byCode[code] ?? null
}
