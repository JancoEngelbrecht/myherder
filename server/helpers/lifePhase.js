/**
 * Compute life phase from age + sex, with optional breed-specific thresholds.
 * Mirrors client-side computeLifePhase() in client/src/stores/cows.js.
 * @returns {'calf' | 'heifer' | 'cow' | 'young_bull' | 'bull'}
 */
function computeLifePhase(cow, breedType = null) {
  if (cow.life_phase_override) return cow.life_phase_override
  if (!cow.dob) return cow.sex === 'male' ? 'bull' : 'cow'

  const ageMs = Date.now() - new Date(cow.dob).getTime()
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44)

  const calfMax = breedType?.calf_max_months ?? 6
  const heiferMin = breedType?.heifer_min_months ?? 15
  const youngBullMin = breedType?.young_bull_min_months ?? 15

  if (cow.sex === 'male') {
    if (ageMonths < calfMax) return 'calf'
    if (ageMonths < youngBullMin) return 'young_bull'
    return 'bull'
  }
  // female
  if (ageMonths < calfMax) return 'calf'
  if (ageMonths < heiferMin) return 'heifer'
  return 'cow'
}

/** Life phases that should never have milk withdrawal */
const NON_MILKING_PHASES = new Set(['heifer', 'calf'])

module.exports = { computeLifePhase, NON_MILKING_PHASES }
