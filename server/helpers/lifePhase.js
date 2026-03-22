/**
 * Compute life phase from age + sex, with optional breed-specific thresholds.
 * Mirrors client-side computeLifePhase() in client/src/stores/cows.js.
 * Species-aware: pass speciesCode to get sheep phases (lamb/ewe/ram).
 * @returns {'calf' | 'heifer' | 'cow' | 'young_bull' | 'bull' | 'lamb' | 'ewe' | 'ram'}
 */
function computeLifePhase(cow, breedType = null, speciesCode = null) {
  if (cow.life_phase_override) return cow.life_phase_override

  const isSheep = speciesCode === 'sheep'
  const defaultAdultFemale = isSheep ? 'ewe' : 'cow'
  const defaultAdultMale = isSheep ? 'ram' : 'bull'
  const youngPhase = isSheep ? 'lamb' : 'calf'
  const youngFemale = isSheep ? 'ewe' : 'heifer'
  const youngMale = isSheep ? 'ram' : 'young_bull'

  if (!cow.dob) return cow.sex === 'male' ? defaultAdultMale : defaultAdultFemale

  const ageMs = Date.now() - new Date(cow.dob).getTime()
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44)

  const calfMax = breedType?.calf_max_months ?? 6
  const heiferMin = breedType?.heifer_min_months ?? (isSheep ? 12 : 15)
  const youngBullMin = breedType?.young_bull_min_months ?? (isSheep ? 12 : 15)

  if (cow.sex === 'male') {
    if (ageMonths < calfMax) return youngPhase
    if (ageMonths < youngBullMin) return youngMale
    return defaultAdultMale
  }
  // female
  if (ageMonths < calfMax) return youngPhase
  if (ageMonths < heiferMin) return youngFemale
  return defaultAdultFemale
}

/** Life phases that should never have milk withdrawal (cattle + sheep young) */
const NON_MILKING_PHASES = new Set(['heifer', 'calf', 'lamb'])

module.exports = { computeLifePhase, NON_MILKING_PHASES }
