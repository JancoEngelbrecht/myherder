export type LifePhase = 'calf' | 'heifer' | 'cow' | 'young_bull' | 'bull' | 'lamb' | 'ewe' | 'ram'

export interface AnimalForLifePhase {
  life_phase_override?: string | null
  dob?: string | null
  sex: 'male' | 'female'
}

export interface BreedTypeForLifePhase {
  calf_max_months?: number
  heifer_min_months?: number
  young_bull_min_months?: number
}

/**
 * Compute life phase from age + sex, with optional breed-specific thresholds.
 * Mirrors client-side computeLifePhase() in client/src/stores/animals.js.
 * Species-aware: pass speciesCode to get sheep phases (lamb/ewe/ram).
 * @returns {'calf' | 'heifer' | 'cow' | 'young_bull' | 'bull' | 'lamb' | 'ewe' | 'ram'}
 */
export function computeLifePhase(
  cow: AnimalForLifePhase,
  breedType: BreedTypeForLifePhase | null = null,
  speciesCode: string | null = null
): LifePhase {
  if (cow.life_phase_override) return cow.life_phase_override as LifePhase

  const isSheep = speciesCode === 'sheep'
  const defaultAdultFemale: LifePhase = isSheep ? 'ewe' : 'cow'
  const defaultAdultMale: LifePhase = isSheep ? 'ram' : 'bull'
  const youngPhase: LifePhase = isSheep ? 'lamb' : 'calf'
  const youngFemale: LifePhase = isSheep ? 'ewe' : 'heifer'
  const youngMale: LifePhase = isSheep ? 'ram' : 'young_bull'

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
export const NON_MILKING_PHASES: ReadonlySet<string> = new Set(['heifer', 'calf', 'lamb'])

module.exports = { computeLifePhase, NON_MILKING_PHASES }
