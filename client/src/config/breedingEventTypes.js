// Fixed breeding event workflow types — not configurable.
// Names are resolved via i18n key `breeding.eventTypes.<code>`.
// `species` array defines which species use this event type (null = all species).
export const BREEDING_EVENT_TYPES = [
  { code: 'heat_observed', emoji: '🔥', sort: 0, species: null },
  { code: 'ai_insemination', emoji: '🧬', sort: 1, species: null },
  { code: 'bull_service', emoji: '🐂', sort: 2, species: ['cattle'] },
  { code: 'ram_service', emoji: '🐏', sort: 3, species: ['sheep'] },
  { code: 'preg_check_positive', emoji: '✅', sort: 4, species: null },
  { code: 'preg_check_negative', emoji: '❌', sort: 5, species: null },
  { code: 'calving', emoji: '🐮', sort: 6, species: ['cattle'] },
  { code: 'lambing', emoji: '🐑', sort: 7, species: ['sheep'] },
  { code: 'abortion', emoji: '⚠️', sort: 8, species: null },
  { code: 'dry_off', emoji: '🌿', sort: 9, species: ['cattle'] },
]

const byCode = Object.fromEntries(BREEDING_EVENT_TYPES.map((t) => [t.code, t]))

export function getEventType(code) {
  return byCode[code] ?? null
}

/**
 * Returns event types filtered for a given species code.
 * Events with species: null are included for all species.
 * @param {string} speciesCode - e.g. 'cattle', 'sheep'
 * @returns {Array} filtered event types sorted by sort order
 */
export function getEventTypesForSpecies(speciesCode) {
  return BREEDING_EVENT_TYPES.filter(
    (t) => t.species === null || t.species.includes(speciesCode)
  ).sort((a, b) => a.sort - b.sort)
}
