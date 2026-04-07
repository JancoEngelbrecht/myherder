import { computed } from 'vue'
import { useSpeciesStore } from '../stores/species'
import i18n from '../i18n'

/**
 * Provides reactive, locale-aware species terminology for the current farm.
 * Falls back to cattle terminology if species data hasn't loaded yet.
 * Terminology is translated via i18n (speciesTerminology.<code>.<term>),
 * falling back to the DB-stored English terms if no translation exists.
 *
 * Usage:
 *   const { singular, plural, collectiveNoun, emoji } = useSpeciesTerms()
 *   // For sheep farm (af): singular='Skaap', collectiveNoun='Trop', emoji.female='🐑'
 *   // For cattle farm (en): singular='Cow', collectiveNoun='Herd', emoji.female='🐄'
 */
export function useSpeciesTerms() {
  const speciesStore = useSpeciesStore()

  const species = computed(() => speciesStore.farmSpecies)
  const config = computed(() => species.value.config)
  const terminology = computed(() => config.value.terminology)
  const emoji = computed(() => config.value.emoji)

  /** Return translated term if available, otherwise fall back to DB value */
  const term = (key: string) =>
    computed(() => {
      const code = species.value.code
      const i18nKey = `speciesTerminology.${code}.${key}`
      const { t, te } = i18n.global
      return te(i18nKey) ? t(i18nKey) : terminology.value[key]
    })

  const singular = term('singular')
  const plural = term('plural')
  const maleSingular = term('maleSingular')
  const femaleSingular = term('femaleSingular')
  const youngSingular = term('youngSingular')
  const youngPlural = term('youngPlural')
  const collectiveNoun = term('collectiveNoun')
  const birthEvent = term('birthEvent')
  const birthEventPast = term('birthEventPast')
  const maleService = term('maleService')

  const speciesCode = computed(() => species.value.code)
  const lifePhasesConfig = computed(() => config.value.life_phases)
  const eventTypes = computed(() => config.value.event_types)
  const typicalMultipleBirths = computed(() => config.value.typical_multiple_births ?? 1)
  const maxOffspring = computed(() => config.value.max_offspring ?? 2)

  return {
    species,
    speciesCode,
    terminology,
    emoji,
    singular,
    plural,
    maleSingular,
    femaleSingular,
    youngSingular,
    youngPlural,
    collectiveNoun,
    birthEvent,
    birthEventPast,
    maleService,
    lifePhasesConfig,
    eventTypes,
    typicalMultipleBirths,
    maxOffspring,
  }
}
