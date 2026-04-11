<template>
  <div class="page">
    <AppHeader
      :title="editMode ? t('breeding.editTitle') : t('breeding.logTitle')"
      show-back
      :back-to="backRoute"
    />

    <div class="content">
      <div v-if="loadingEvent" class="empty-state">
        <span class="spinner" />
        <p>{{ t('common.loading') }}</p>
      </div>

      <form v-else @submit.prevent="submit">
        <!-- Cow selector — read-only in edit mode -->
        <div class="form-group">
          <label>{{ t('breeding.form.cow') }} *</label>
          <div v-if="editMode" class="cow-readonly">
            <span class="mono">{{ editCowLabel }}</span>
          </div>
          <template v-else>
            <AnimalSearchDropdown
              v-model="form.animal_id"
              :placeholder="t('breeding.form.cowPlaceholder')"
              :error="errors.animal_id"
              sex-filter="female"
            />
          </template>
        </div>

        <!-- Event type -->
        <div class="form-group">
          <label>{{ t('breeding.form.eventType') }} *</label>
          <div class="event-type-grid">
            <button
              v-for="et in displayEventTypes"
              :key="et.code"
              type="button"
              class="event-type-btn"
              :class="{ active: form.event_type === et.code }"
              @click="form.event_type = et.code"
            >
              <span class="et-icon"><AppIcon :name="et.icon ?? 'calendar'" :size="22" /></span>
              <span class="et-label">{{ t(`breeding.eventTypes.${et.code}`) }}</span>
            </button>
          </div>
          <span v-if="errors.event_type" class="field-error">{{ errors.event_type }}</span>
        </div>

        <!-- Event date -->
        <div class="form-group">
          <label>{{ t('breeding.form.eventDate') }}</label>
          <input
            v-model="form.event_date"
            type="datetime-local"
            class="form-input"
            :max="maxDateTime"
          />
        </div>

        <!-- AI-only fields: semen ID + inseminator -->
        <template v-if="isInsemination">
          <div class="form-group">
            <label>{{ t('breeding.form.semenId') }}</label>
            <input
              v-model="form.semen_id"
              type="text"
              class="form-input"
              :placeholder="t('breeding.form.semenIdPlaceholder')"
            />
          </div>
          <div class="form-group">
            <label>{{ t('breeding.form.inseminator') }}</label>
            <input
              v-model="form.inseminator"
              type="text"
              class="form-input"
              :placeholder="t('breeding.form.inseminatorPlaceholder')"
            />
          </div>
        </template>

        <!-- Sire selection — for bull_service or ram_service -->
        <template v-if="form.event_type === 'bull_service' || form.event_type === 'ram_service'">
          <div class="form-group">
            <label>{{ t(`breeding.form.sire_${speciesCode}`, t('breeding.form.sire')) }}</label>
            <AnimalSearchDropdown
              v-model="form.sire_id"
              :placeholder="
                t(
                  `breeding.form.sirePlaceholder_${speciesCode}`,
                  t('breeding.form.sirePlaceholder')
                )
              "
              sex-filter="male"
            />
          </div>
        </template>

        <!-- Preg check method -->
        <template v-if="isPregCheck">
          <div class="form-group">
            <label>{{ t('breeding.form.pregCheckMethod') }}</label>
            <div class="method-row">
              <button
                v-for="m in PREG_CHECK_METHODS"
                :key="m"
                type="button"
                class="method-btn"
                :class="{ active: form.preg_check_method === m }"
                @click="form.preg_check_method = m"
              >
                {{ t(`breeding.pregCheckMethod.${m}`) }}
              </button>
            </div>
          </div>
        </template>

        <!-- Expected calving date (preg check positive only) -->
        <template v-if="form.event_type === 'preg_check_positive'">
          <div class="form-group">
            <label>{{ t('breeding.form.expectedCalving') }}</label>
            <input v-model="form.expected_calving" type="date" class="form-input" />
            <span v-if="prefillSource" class="field-hint">{{ prefillSource }}</span>
          </div>
          <div v-if="computedDryOff" class="auto-dates-preview card">
            <div class="preview-dates">
              <div class="preview-item">
                <span class="preview-key"
                  ><AppIcon name="baby" :size="14" class="preview-icon" />
                  {{ t('breeding.dates.calving') }}</span
                >
                <span class="preview-val mono">{{ form.expected_calving }}</span>
              </div>
              <div class="preview-item">
                <span class="preview-key"
                  ><AppIcon name="leaf" :size="14" class="preview-icon" />
                  {{ t('breeding.dates.dryOff') }}</span
                >
                <span class="preview-val mono">{{ computedDryOff }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Offspring count — shown for birth events (calving/lambing) -->
        <template v-if="isBirthEvent">
          <div class="form-group">
            <label>{{ t('breeding.offspringCount') }}</label>
            <input
              v-model.number="form.offspring_count"
              type="number"
              class="form-input"
              min="1"
              :max="maxOffspring"
            />
          </div>
        </template>

        <!-- Register offspring prompt (shown after save, only for birth events) -->
        <div v-if="showOffspringPrompt" class="offspring-prompt card">
          <p class="offspring-prompt-text">
            {{ t('breeding.registerOffspringPrompt', { count: lastSavedOffspringCount }) }}
          </p>
          <div class="offspring-prompt-actions">
            <button
              type="button"
              class="btn-primary"
              style="width: auto"
              @click="goRegisterOffspring"
            >
              {{ t('breeding.registerOffspringYes') }}
            </button>
            <button type="button" class="btn-secondary" style="width: auto" @click="skipOffspring">
              {{ t('breeding.registerOffspringNo') }}
            </button>
          </div>
        </div>

        <!-- Cost -->
        <div class="form-group">
          <label>{{ t('breeding.form.cost') }}</label>
          <input
            v-model.number="form.cost"
            type="number"
            class="form-input"
            min="0"
            step="0.01"
            placeholder="0.00"
          />
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label>{{ t('breeding.form.notes') }}</label>
          <textarea
            v-model="form.notes"
            class="form-input"
            rows="3"
            :placeholder="t('breeding.form.notesPlaceholder')"
          />
        </div>

        <!-- Auto-dates preview (new events only) -->
        <div v-if="!editMode && autoDates && hasAutoDates" class="auto-dates-preview card">
          <p class="preview-label">{{ t('breeding.form.autoDatesPreview') }}</p>
          <div class="preview-dates">
            <div v-if="autoDates.expected_next_heat" class="preview-item">
              <span class="preview-key"
                ><AppIcon name="flame" :size="14" class="preview-icon" />
                {{ t('breeding.dates.nextHeat') }}</span
              >
              <span class="preview-val mono">{{ autoDates.expected_next_heat }}</span>
            </div>
            <div v-if="autoDates.expected_preg_check" class="preview-item">
              <span class="preview-key"
                ><AppIcon name="stethoscope" :size="14" class="preview-icon" />
                {{ t('breeding.dates.pregCheck') }}</span
              >
              <span class="preview-val mono">{{ autoDates.expected_preg_check }}</span>
            </div>
            <div v-if="autoDates.expected_calving" class="preview-item">
              <span class="preview-key"
                ><AppIcon name="baby" :size="14" class="preview-icon" />
                {{ t('breeding.dates.calving') }}</span
              >
              <span class="preview-val mono">{{ autoDates.expected_calving }}</span>
            </div>
            <div v-if="autoDates.expected_dry_off" class="preview-item">
              <span class="preview-key"
                ><AppIcon name="leaf" :size="14" class="preview-icon" />
                {{ t('breeding.dates.dryOff') }}</span
              >
              <span class="preview-val mono">{{ autoDates.expected_dry_off }}</span>
            </div>
          </div>
        </div>

        <!-- Error -->
        <p v-if="submitError" class="form-error">{{ submitError }}</p>

        <button type="submit" class="btn-primary" :disabled="saving">
          {{ saving ? t('common.saving') : editMode ? t('common.save') : t('breeding.logEvent') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/organisms/AppHeader.vue'
import AppIcon from '../components/atoms/AppIcon.vue'
import AnimalSearchDropdown from '../components/molecules/AnimalSearchDropdown.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { getEventType, getEventTypesForSpecies } from '../config/breedingEventTypes'
import { useBreedTypesStore } from '../stores/breedTypes'
import { useAnimalsStore } from '../stores/animals'
import { useSpeciesTerms } from '../composables/useSpeciesTerms'
import api from '../services/api'
import { extractApiError, resolveError } from '../utils/apiError'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const breedingStore = useBreedingEventsStore()
const breedTypesStore = useBreedTypesStore()
const animalsStore = useAnimalsStore()
const { speciesCode, typicalMultipleBirths, maxOffspring } = useSpeciesTerms()

const PREG_CHECK_METHODS = ['manual', 'ultrasound', 'blood_test']

const editMode = computed(() => !!route.params.id)
const loadingEvent = ref(false)
const editCowLabel = ref('')

const displayEventTypes = computed(() => getEventTypesForSpecies(speciesCode.value))

const nowLocal = () => {
  const d = new Date()
  d.setSeconds(0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const maxDateTime = computed(() => nowLocal())

const form = ref({
  animal_id: '',
  event_type: '',
  event_date: nowLocal(),
  semen_id: '',
  inseminator: '',
  sire_id: '',
  preg_check_method: null,
  offspring_count: 1,
  cost: null,
  notes: '',
  expected_calving: '',
})

const errors = ref({})
const saving = ref(false)
const submitError = ref(null)

const showOffspringPrompt = ref(false)
const lastSavedOffspringCount = ref(0)
const lastSavedEventId = ref(null)
const lastSavedAnimalId = ref(null)

const backRoute = computed(() => {
  if (route.query.from) return String(route.query.from)
  const queryAnimalId = route.query.animal_id || route.query.cow_id
  if (queryAnimalId) return `/animals/${queryAnimalId}/repro`
  return '/breed'
})

const isInsemination = computed(() => form.value.event_type === 'ai_insemination')

const isPregCheck = computed(() =>
  ['preg_check_positive', 'preg_check_negative'].includes(form.value.event_type)
)

const isBirthEvent = computed(() => ['calving', 'lambing'].includes(form.value.event_type))

// Look up breed timings for the selected cow
const selectedCowBreed = computed(() => {
  if (!form.value.animal_id) return null
  const cow = animalsStore.animals.find((c) => c.id === form.value.animal_id)
  if (!cow?.breed_type_id) return null
  return breedTypesStore.getById(cow.breed_type_id)
})

// Find the latest insemination's expected_calving for the selected cow
function findLatestInsemCalving(cowId) {
  if (!cowId) return null
  return (
    breedingStore.events
      .filter(
        (e) =>
          e.animal_id === cowId &&
          ['ai_insemination', 'bull_service', 'ram_service'].includes(e.event_type) &&
          e.expected_calving
      )
      .sort((a, b) => b.event_date.localeCompare(a.event_date))[0] ?? null
  )
}

// Compute dry-off date from the entered expected calving date
const computedDryOff = computed(() => {
  if (!form.value.expected_calving) return null
  const dryOffDays = selectedCowBreed.value?.dry_off_days ?? 60
  const calving = new Date(form.value.expected_calving)
  calving.setDate(calving.getDate() - dryOffDays)
  return calving.toISOString().slice(0, 10)
})

// Hint text showing where the pre-filled date came from
const prefillSource = computed(() => {
  if (form.value.event_type !== 'preg_check_positive') return null
  const insem = findLatestInsemCalving(form.value.animal_id)
  if (insem) return t('breeding.form.expectedCalvingHint')
  return null
})

// Pre-fill expected_calving from latest insemination when animal/event_type changes
watch(
  () => [form.value.animal_id, form.value.event_type],
  ([cowId, eventType]) => {
    if (eventType !== 'preg_check_positive' || editMode.value) return
    const insem = findLatestInsemCalving(cowId)
    form.value.expected_calving = insem?.expected_calving ?? ''
  }
)

const autoDates = computed(() => {
  const { event_type, event_date } = form.value
  if (!event_date || !event_type) return null
  if (!['heat_observed', 'ai_insemination', 'bull_service', 'ram_service'].includes(event_type))
    return null

  const bt = selectedCowBreed.value
  const heatCycle = bt?.heat_cycle_days ?? 21
  const pregCheck = bt?.preg_check_days ?? 35
  const gestation = bt?.gestation_days ?? 283
  const dryOffDays = bt?.dry_off_days ?? 60

  const base = new Date(event_date)
  const addDays = (n) => {
    const d = new Date(base)
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  const result = {
    expected_next_heat: addDays(heatCycle),
    expected_preg_check: addDays(pregCheck),
    expected_calving: null,
    expected_dry_off: null,
  }

  if (['ai_insemination', 'bull_service', 'ram_service'].includes(event_type)) {
    const calving = new Date(base)
    calving.setDate(calving.getDate() + gestation)
    const dryOff = new Date(calving)
    dryOff.setDate(dryOff.getDate() - dryOffDays)
    result.expected_calving = calving.toISOString().slice(0, 10)
    result.expected_dry_off = dryOff.toISOString().slice(0, 10)
  }

  return result
})

const hasAutoDates = computed(
  () => autoDates.value && (autoDates.value.expected_next_heat || autoDates.value.expected_calving)
)

// Reset offspring_count when switching to a birth event type
watch(
  () => form.value.event_type,
  (eventType) => {
    if (['calving', 'lambing'].includes(eventType)) {
      form.value.offspring_count = typicalMultipleBirths.value
    }
  }
)

function goRegisterOffspring() {
  showOffspringPrompt.value = false
  const q = {
    birth_event_id: lastSavedEventId.value,
    dam_id: lastSavedAnimalId.value,
    offspring_total: String(lastSavedOffspringCount.value),
    offspring_index: '1',
    dob: new Date().toISOString().slice(0, 10),
  }
  router.replace({ path: '/animals/new', query: q })
}

function skipOffspring() {
  showOffspringPrompt.value = false
  if (lastSavedAnimalId.value) {
    router.replace(`/animals/${lastSavedAnimalId.value}/repro`)
  } else {
    router.replace('/breed')
  }
}

function validate() {
  const e = {}
  if (!editMode.value && !form.value.animal_id) e.animal_id = t('common.required')
  if (!form.value.event_type) e.event_type = t('common.required')
  errors.value = e
  return Object.keys(e).length === 0
}

async function submit() {
  if (!validate()) return

  saving.value = true
  submitError.value = null

  try {
    if (editMode.value) {
      const payload = {
        event_type: form.value.event_type,
        event_date: form.value.event_date,
        semen_id: form.value.semen_id || null,
        inseminator: form.value.inseminator || null,
        sire_id: form.value.sire_id || null,
        preg_check_method: form.value.preg_check_method || null,
        cost: form.value.cost ?? null,
        notes: form.value.notes || null,
      }

      payload.calving_details = null
      if (isBirthEvent.value) {
        payload.offspring_count = form.value.offspring_count || 1
      }

      if (form.value.event_type === 'preg_check_positive') {
        payload.expected_calving = form.value.expected_calving || null
        payload.expected_dry_off = computedDryOff.value || null
      }

      await breedingStore.updateEvent(String(route.params.id), payload)
      router.replace(backRoute.value)
    } else {
      const payload = {
        animal_id: form.value.animal_id,
        event_type: form.value.event_type,
        event_date: form.value.event_date,
        semen_id: form.value.semen_id || null,
        inseminator: form.value.inseminator || null,
        sire_id: form.value.sire_id || null,
        preg_check_method: form.value.preg_check_method || null,
        cost: form.value.cost ?? null,
        notes: form.value.notes || null,
      }

      if (isBirthEvent.value) {
        payload.calving_details = null
        payload.offspring_count = form.value.offspring_count || 1
      }

      if (form.value.event_type === 'preg_check_positive') {
        payload.expected_calving = form.value.expected_calving || null
        payload.expected_dry_off = computedDryOff.value || null
      }

      const created = await breedingStore.createEvent(payload)

      // Post-birth event: always show offspring registration prompt
      if (isBirthEvent.value) {
        lastSavedOffspringCount.value = form.value.offspring_count || 1
        lastSavedEventId.value = created.id
        lastSavedAnimalId.value = created.animal_id
        showOffspringPrompt.value = true
      } else {
        router.replace(backRoute.value)
      }
    }
  } catch (err) {
    submitError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  // Fetch breed types for auto-date calculation
  if (!breedTypesStore.hasData) {
    breedTypesStore.fetchActive().catch(() => {})
  }
  // Ensure cows list is loaded for breed lookup
  if (animalsStore.animals.length === 0) {
    animalsStore.fetchAll().catch(() => {})
  }

  if (editMode.value) {
    // Load existing event for editing
    loadingEvent.value = true
    try {
      const { data } = await api.get(`/breeding-events/${route.params.id}`)
      form.value.animal_id = data.animal_id
      form.value.event_type = data.event_type
      form.value.event_date = data.event_date
        ? new Date(data.event_date).toISOString().slice(0, 16)
        : nowLocal()
      form.value.semen_id = data.semen_id ?? ''
      form.value.inseminator = data.inseminator ?? ''
      form.value.sire_id = data.sire_id ?? ''
      form.value.preg_check_method = data.preg_check_method ?? null
      form.value.expected_calving = data.expected_calving ?? ''
      form.value.cost = data.cost ?? null
      form.value.notes = data.notes ?? ''

      editCowLabel.value = data.tag_number
        ? `${data.tag_number}${data.animal_name ? ` · ${data.animal_name}` : ''}`
        : data.animal_id
    } catch {
      submitError.value = t('common.errorLoading')
    } finally {
      loadingEvent.value = false
    }
  } else {
    const queryAnimalId = route.query.animal_id || route.query.cow_id
    if (queryAnimalId) {
      form.value.animal_id = String(queryAnimalId)
    }
    if (route.query.event_type) {
      const qt = String(route.query.event_type)
      if (getEventType(qt)) {
        form.value.event_type = qt
      }
    }
  }
})
</script>

<style scoped>
.content {
  padding: 1rem;
  padding-top: calc(var(--header-height) + 1rem);
  padding-bottom: 5rem;
  max-width: 600px;
  margin: 0 auto;
}

.cow-readonly {
  padding: 0.65rem 0.85rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.95rem;
}

.event-type-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.event-type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.75rem 0.5rem;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  cursor: pointer;
  transition: all 0.15s;
}

.event-type-btn.active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.et-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  color: var(--text-secondary);
}

.event-type-btn.active .et-icon {
  color: var(--primary);
}

.preview-icon {
  vertical-align: middle;
}

.et-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text);
  text-align: center;
  line-height: 1.2;
}

.method-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.method-btn {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.method-btn.active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary);
}

.auto-dates-preview {
  padding: 0.85rem 1rem;
  margin-bottom: 1rem;
  background: color-mix(in srgb, var(--primary) 5%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
}

.preview-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--primary);
  margin: 0 0 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preview-dates {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.preview-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}

.preview-key {
  color: var(--text-secondary);
}

.preview-val {
  font-weight: 600;
  color: var(--text);
}

.field-error {
  display: block;
  font-size: 0.8rem;
  color: var(--danger);
  margin-top: 0.25rem;
}

.offspring-prompt {
  margin-bottom: 1rem;
  padding: 1rem;
  background: color-mix(in srgb, var(--primary) 5%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
}

.offspring-prompt-text {
  margin: 0 0 0.75rem;
  font-size: 0.9375rem;
  color: var(--text);
}

.offspring-prompt-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
