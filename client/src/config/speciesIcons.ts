/**
 * Maps species codes to icon names for use with <AppIcon>.
 * These are semantic names resolved via iconMap.ts — not emoji.
 *
 * Lucide does not have dedicated cow/sheep icons.
 * We use 'cow' and 'sheep' as semantic names which iconMap
 * maps to the closest available Lucide icons (Beef, Rabbit).
 *
 * When Lucide adds better animal icons, update iconMap.ts only.
 */

interface SpeciesIconSet {
  /** Icon name for female animals (resolved via iconMap) */
  female: string
  /** Icon name for male animals (resolved via iconMap) */
  male: string
  /** Icon name for young animals (resolved via iconMap) */
  young: string
  /** Default/generic icon for this species */
  default: string
}

interface SpeciesIconConfig {
  [speciesCode: string]: SpeciesIconSet
}

export const SPECIES_ICONS: SpeciesIconConfig = {
  cattle: {
    female: 'cow',
    male: 'bull',
    young: 'cow',
    default: 'cow',
  },
  sheep: {
    female: 'sheep',
    male: 'ram',
    young: 'sheep',
    default: 'sheep',
  },
}

/** Fallback icons when species code is unknown */
const FALLBACK_ICONS: SpeciesIconSet = {
  female: 'animal',
  male: 'animal',
  young: 'animal',
  default: 'animal',
}

/**
 * Get the icon set for a species code.
 * Falls back to generic animal icons if species not configured.
 */
export function getSpeciesIcons(speciesCode: string): SpeciesIconSet {
  return SPECIES_ICONS[speciesCode] ?? FALLBACK_ICONS
}

/**
 * Get a single icon name for a species+sex combination.
 * @param speciesCode - e.g. 'cattle', 'sheep'
 * @param sex - 'female', 'male', or 'young'
 */
export function getSpeciesIcon(speciesCode: string, sex: keyof SpeciesIconSet = 'default'): string {
  const icons = getSpeciesIcons(speciesCode)
  return icons[sex] ?? icons.default
}
