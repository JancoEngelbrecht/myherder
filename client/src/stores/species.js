import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'
import db from '../db/indexedDB'
import { isOfflineError } from '../services/syncManager'
import { useAuthStore } from './auth'

// Cattle fallback config — used when species data hasn't loaded yet
const CATTLE_FALLBACK = {
  id: '_fallback_cattle',
  code: 'cattle',
  name: 'Cattle',
  config: {
    terminology: {
      singular: 'Cow',
      plural: 'Cows',
      maleSingular: 'Bull',
      femaleSingular: 'Cow',
      youngSingular: 'Calf',
      youngPlural: 'Calves',
      collectiveNoun: 'Herd',
      birthEvent: 'Calving',
      birthEventPast: 'Calved',
      maleService: 'Bull Service',
    },
    emoji: { female: '🐄', male: '🐂', young: '🐮' },
    life_phases: {
      female: [
        { code: 'calf', maxMonths: 6 },
        { code: 'heifer', minMonths: 6 },
        { code: 'cow', minMonths: 15 },
      ],
      male: [
        { code: 'calf', maxMonths: 6 },
        { code: 'young_bull', minMonths: 6 },
        { code: 'bull', minMonths: 15 },
      ],
    },
    event_types: [
      'heat_observed',
      'ai_insemination',
      'bull_service',
      'preg_check_positive',
      'preg_check_negative',
      'calving',
      'abortion',
      'dry_off',
    ],
    typical_multiple_births: 1,
    max_offspring: 2,
  },
}

export const useSpeciesStore = defineStore('species', () => {
  const all = ref([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try {
      const { data } = await api.get('/species')
      all.value = data
      await db.species.bulkPut(
        data.map((sp) => ({
          ...sp,
          config: typeof sp.config === 'string' ? sp.config : JSON.stringify(sp.config),
        }))
      )
    } catch (err) {
      if (!isOfflineError(err)) throw err
      // Offline fallback — try IndexedDB
      try {
        const local = await db.species.toArray()
        if (local.length) {
          all.value = local.map((row) => {
            let config = {}
            if (row.config) {
              try {
                config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
              } catch {
                config = {}
              }
            }
            return { ...row, config }
          })
        }
      } catch {
        // IndexedDB unavailable (private mode) — species data stays empty, getters use CATTLE_FALLBACK
      }
    } finally {
      loading.value = false
    }
  }

  /** Get species by ID. Falls back to cattle config if not found. */
  function getById(id) {
    return all.value.find((s) => s.id === id) ?? CATTLE_FALLBACK
  }

  /** Get species by code (e.g. 'cattle', 'sheep'). */
  function getByCode(code) {
    return all.value.find((s) => s.code === code) ?? CATTLE_FALLBACK
  }

  /** The species for the current farm. Resolves from species_code in JWT. */
  const farmSpecies = computed(() => {
    const authStore = useAuthStore()
    if (authStore.user?.species_code) {
      return getByCode(authStore.user.species_code)
    }
    return CATTLE_FALLBACK
  })

  /** Terminology for the farm's species */
  function getTerminology(speciesId) {
    return getById(speciesId)?.config?.terminology
  }

  /** Life phases for the farm's species */
  function getLifePhases(speciesId) {
    return getById(speciesId)?.config?.life_phases
  }

  /** Valid event types for the farm's species */
  function getEventTypes(speciesId) {
    return getById(speciesId)?.config?.event_types
  }

  /** Emoji set for the farm's species */
  function getEmoji(speciesId) {
    return getById(speciesId)?.config?.emoji
  }

  /** True when real data has been loaded (not just fallbacks) */
  const hasData = computed(() => all.value.length > 0)

  return {
    all,
    loading,
    hasData,
    fetchAll,
    getById,
    getByCode,
    farmSpecies,
    getTerminology,
    getLifePhases,
    getEventTypes,
    getEmoji,
  }
})
