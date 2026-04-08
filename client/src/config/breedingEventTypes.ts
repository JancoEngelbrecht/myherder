// Fixed breeding event workflow types — not configurable.
// Names are resolved via i18n key `breeding.eventTypes.<code>`.
// `species` array defines which species use this event type (null = all species).
// `icon` maps to an AppIcon name (semantic, from iconMap.ts). Keep `emoji` for backward compat.
export const BREEDING_EVENT_TYPES = [
  { code: 'heat_observed', emoji: '🔥', icon: 'flame', sort: 0, species: null },
  { code: 'ai_insemination', emoji: '🧬', icon: 'syringe', sort: 1, species: null },
  { code: 'bull_service', emoji: '🐂', icon: 'bull', sort: 2, species: ['cattle'] },
  { code: 'ram_service', emoji: '🐏', icon: 'sheep', sort: 3, species: ['sheep'] },
  { code: 'preg_check_positive', emoji: '✅', icon: 'circle-check', sort: 4, species: null },
  { code: 'preg_check_negative', emoji: '❌', icon: 'circle-x', sort: 5, species: null },
  { code: 'calving', emoji: '🐮', icon: 'baby', sort: 6, species: ['cattle'] },
  { code: 'lambing', emoji: '🐑', icon: 'baby', sort: 7, species: ['sheep'] },
  { code: 'abortion', emoji: '⚠️', icon: 'alert-triangle', sort: 8, species: null },
  { code: 'dry_off', emoji: '🌿', icon: 'leaf', sort: 9, species: ['cattle'] },
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
