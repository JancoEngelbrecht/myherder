const db = require('../config/database')

// ── Auto-date calculation ─────────────────────────────────────────────────────

function calcDates(eventType, eventDate, breedTimings = {}) {
  const base = new Date(eventDate)
  const heatCycleDays = breedTimings.heat_cycle_days ?? 21    // Bovine estrous cycle (avg 21 days)
  const pregCheckDays = breedTimings.preg_check_days ?? 35    // Earliest reliable rectal/ultrasound check
  const gestationDays = breedTimings.gestation_days ?? 283    // Holstein average; Jersey ~279, Brahman ~292
  const dryOffDays = breedTimings.dry_off_days ?? 60          // Standard dry period before expected calving

  const addDays = (n) => {
    const d = new Date(base)
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  if (['heat_observed', 'ai_insemination', 'bull_service'].includes(eventType)) {
    const result = {
      expected_next_heat: addDays(heatCycleDays),
      expected_preg_check: addDays(pregCheckDays),
      expected_calving: null,
      expected_dry_off: null,
    }

    if (['ai_insemination', 'bull_service'].includes(eventType)) {
      const calvingDate = new Date(base)
      calvingDate.setDate(calvingDate.getDate() + gestationDays)
      const dryOffDate = new Date(calvingDate)
      dryOffDate.setDate(dryOffDate.getDate() - dryOffDays)
      result.expected_calving = calvingDate.toISOString().slice(0, 10)
      result.expected_dry_off = dryOffDate.toISOString().slice(0, 10)
    }

    return result
  }

  return {
    expected_next_heat: null,
    expected_preg_check: null,
    expected_calving: null,
    expected_dry_off: null,
  }
}

// Look up breed-specific timing values by breed_type_id.
// Returns the full breed_types row, or {} if no breed is assigned.
// Used by POST/PATCH handlers to pass breed timings into calcDates().
async function getBreedTimings(breedTypeId) {
  if (!breedTypeId) return {}
  const breed = await db('breed_types').where({ id: breedTypeId }).first()
  return breed || {}
}

module.exports = { calcDates, getBreedTimings }
