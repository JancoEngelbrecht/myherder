import { computed } from 'vue'
import { useSpeciesStore } from '../stores/species'

/**
 * Provides reactive species terminology for the current farm.
 * Falls back to cattle terminology if species data hasn't loaded yet.
 *
 * Usage:
 *   const { singular, plural, collectiveNoun, emoji } = useSpeciesTerms()
 *   // For sheep farm: singular='Sheep', collectiveNoun='Flock', emoji.female='🐑'
 *   // For cattle farm: singular='Cow', collectiveNoun='Herd', emoji.female='🐄'
 */
export function useSpeciesTerms() {
  const speciesStore = useSpeciesStore()

  const species = computed(() => speciesStore.farmSpecies)
  const config = computed(() => species.value.config)
  const terminology = computed(() => config.value.terminology)
  const emoji = computed(() => config.value.emoji)

  const singular = computed(() => terminology.value.singular)
  const plural = computed(() => terminology.value.plural)
  const maleSingular = computed(() => terminology.value.maleSingular)
  const femaleSingular = computed(() => terminology.value.femaleSingular)
  const youngSingular = computed(() => terminology.value.youngSingular)
  const youngPlural = computed(() => terminology.value.youngPlural)
  const collectiveNoun = computed(() => terminology.value.collectiveNoun)
  const birthEvent = computed(() => terminology.value.birthEvent)
  const birthEventPast = computed(() => terminology.value.birthEventPast)
  const maleService = computed(() => terminology.value.maleService)

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
