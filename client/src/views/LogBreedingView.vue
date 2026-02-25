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
            <CowSearchDropdown
              v-model="form.cow_id"
              :placeholder="t('breeding.form.cowPlaceholder')"
              :error="errors.cow_id"
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
              <span class="et-icon">{{ et.emoji }}</span>
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

        <!-- Bull service sire -->
        <template v-if="form.event_type === 'bull_service'">
          <div class="form-group">
            <label>{{ t('breeding.form.sire') }}</label>
            <CowSearchDropdown
              v-model="form.sire_id"
              :placeholder="t('breeding.form.sirePlaceholder')"
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

        <!-- Calving details -->
        <template v-if="form.event_type === 'calving'">
          <div class="form-group">
            <label>{{ t('breeding.form.calfSex') }}</label>
            <div class="method-row">
              <button
                type="button"
                class="method-btn"
                :class="{ active: form.calving_details.calf_sex === 'female' }"
                @click="form.calving_details.calf_sex = 'female'"
              >🐄 {{ t('sex.female') }}</button>
              <button
                type="button"
                class="method-btn"
                :class="{ active: form.calving_details.calf_sex === 'male' }"
                @click="form.calving_details.calf_sex = 'male'"
              >🐂 {{ t('sex.male') }}</button>
            </div>
          </div>
          <div class="form-group">
            <label>{{ t('breeding.form.calfTagNumber') }}</label>
            <input
              v-model="form.calving_details.calf_tag_number"
              type="text"
              class="form-input"
              :placeholder="t('breeding.form.calfTagPlaceholder')"
            />
          </div>
          <div class="form-group">
            <label>{{ t('breeding.form.calfWeight') }}</label>
            <input
              v-model.number="form.calving_details.calf_weight"
              type="number"
              class="form-input"
              min="0"
              step="0.1"
              placeholder="e.g. 38"
            />
          </div>
        </template>

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
              <span class="preview-key">🔥 {{ t('breeding.dates.nextHeat') }}</span>
              <span class="preview-val mono">{{ autoDates.expected_next_heat }}</span>
            </div>
            <div v-if="autoDates.expected_preg_check" class="preview-item">
              <span class="preview-key">🩺 {{ t('breeding.dates.pregCheck') }}</span>
              <span class="preview-val mono">{{ autoDates.expected_preg_check }}</span>
            </div>
            <div v-if="autoDates.expected_calving" class="preview-item">
              <span class="preview-key">🐮 {{ t('breeding.dates.calving') }}</span>
              <span class="preview-val mono">{{ autoDates.expected_calving }}</span>
            </div>
            <div v-if="autoDates.expected_dry_off" class="preview-item">
              <span class="preview-key">🌿 {{ t('breeding.dates.dryOff') }}</span>
              <span class="preview-val mono">{{ autoDates.expected_dry_off }}</span>
            </div>
          </div>
        </div>

        <!-- Error -->
        <p v-if="submitError" class="submit-error">{{ submitError }}</p>

        <button type="submit" class="btn-primary" :disabled="saving">
          {{ saving ? t('common.saving') : editMode ? t('common.save') : t('breeding.logEvent') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/organisms/AppHeader.vue'
import CowSearchDropdown from '../components/molecules/CowSearchDropdown.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { BREEDING_EVENT_TYPES, getEventType } from '../config/breedingEventTypes'
import { useBreedTypesStore } from '../stores/breedTypes'
import { useCowsStore } from '../stores/cows'
import api from '../services/api'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const breedingStore = useBreedingEventsStore()
const breedTypesStore = useBreedTypesStore()
const cowsStore = useCowsStore()

const PREG_CHECK_METHODS = ['manual', 'ultrasound', 'blood_test']

const editMode = computed(() => !!route.params.id)
const loadingEvent = ref(false)
const editCowLabel = ref('')

const displayEventTypes = BREEDING_EVENT_TYPES

const nowLocal = () => {
  const d = new Date()
  d.setSeconds(0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const maxDateTime = computed(() => nowLocal())

const form = ref({
  cow_id: '',
  event_type: '',
  event_date: nowLocal(),
  semen_id: '',
  inseminator: '',
  sire_id: '',
  preg_check_method: null,
  calving_details: { calf_sex: null, calf_tag_number: '', calf_weight: null },
  cost: null,
  notes: '',
})

const errors = ref({})
const saving = ref(false)
const submitError = ref(null)

const backRoute = computed(() => {
  if (route.query.from) return String(route.query.from)
  if (route.query.cow_id) return `/cows/${route.query.cow_id}/repro`
  return '/breed'
})

const isInsemination = computed(() => form.value.event_type === 'ai_insemination')

const isPregCheck = computed(() =>
  ['preg_check_positive', 'preg_check_negative'].includes(form.value.event_type),
)

// Look up breed timings for the selected cow
const selectedCowBreed = computed(() => {
  if (!form.value.cow_id) return null
  const cow = cowsStore.cows.find((c) => c.id === form.value.cow_id)
  if (!cow?.breed_type_id) return null
  return breedTypesStore.getById(cow.breed_type_id)
})

const autoDates = computed(() => {
  const { event_type, event_date } = form.value
  if (!event_date || !event_type) return null
  if (!['heat_observed', 'ai_insemination', 'bull_service'].includes(event_type)) return null

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

  if (['ai_insemination', 'bull_service'].includes(event_type)) {
    const calving = new Date(base)
    calving.setDate(calving.getDate() + gestation)
    const dryOff = new Date(calving)
    dryOff.setDate(dryOff.getDate() - dryOffDays)
    result.expected_calving = calving.toISOString().slice(0, 10)
    result.expected_dry_off = dryOff.toISOString().slice(0, 10)
  }

  return result
})

const hasAutoDates = computed(() =>
  autoDates.value &&
  (autoDates.value.expected_next_heat || autoDates.value.expected_calving),
)

function validate() {
  const e = {}
  if (!editMode.value && !form.value.cow_id) e.cow_id = t('common.required')
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

      if (form.value.event_type === 'calving') {
        const cd = form.value.calving_details
        payload.calving_details = (cd.calf_sex || cd.calf_tag_number || cd.calf_weight) ? cd : null
      } else {
        payload.calving_details = null
      }

      await breedingStore.updateEvent(String(route.params.id), payload)
      router.replace(backRoute.value)
    } else {
      const payload = {
        cow_id: form.value.cow_id,
        event_type: form.value.event_type,
        event_date: form.value.event_date,
        semen_id: form.value.semen_id || null,
        inseminator: form.value.inseminator || null,
        sire_id: form.value.sire_id || null,
        preg_check_method: form.value.preg_check_method || null,
        cost: form.value.cost ?? null,
        notes: form.value.notes || null,
      }

      if (form.value.event_type === 'calving') {
        const cd = form.value.calving_details
        payload.calving_details = (cd.calf_sex || cd.calf_tag_number || cd.calf_weight) ? cd : null
      }

      const created = await breedingStore.createEvent(payload)

      // Post-calving: redirect to Add Cow form with pre-filled calf details
      if (form.value.event_type === 'calving' && form.value.calving_details.calf_sex) {
        const q = {
          from_calving: 'true',
          dam_id: created.cow_id,
          dob: new Date().toISOString().slice(0, 10),
          sex: form.value.calving_details.calf_sex,
        }
        if (form.value.calving_details.calf_tag_number) {
          q.tag_number = form.value.calving_details.calf_tag_number
        }
        if (created.sire_id) q.sire_id = created.sire_id
        if (created.breed_type_id) q.breed_type_id = created.breed_type_id
        router.replace({ path: '/cows/new', query: q })
      } else if (route.query.cow_id) {
        router.replace(`/cows/${created.cow_id}/repro`)
      } else {
        router.replace('/breed')
      }
    }
  } catch (err) {
    submitError.value = err.response?.data?.error ?? err.message
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  // Fetch breed types for auto-date calculation
  if (breedTypesStore.activeTypes.length === 0) {
    breedTypesStore.fetchActive().catch(() => {})
  }
  // Ensure cows list is loaded for breed lookup
  if (cowsStore.cows.length === 0) {
    cowsStore.fetchAll().catch(() => {})
  }

  if (editMode.value) {
    // Load existing event for editing
    loadingEvent.value = true
    try {
      const { data } = await api.get(`/breeding-events/${route.params.id}`)
      form.value.cow_id = data.cow_id
      form.value.event_type = data.event_type
      form.value.event_date = data.event_date
        ? new Date(data.event_date).toISOString().slice(0, 16)
        : nowLocal()
      form.value.semen_id = data.semen_id ?? ''
      form.value.inseminator = data.inseminator ?? ''
      form.value.sire_id = data.sire_id ?? ''
      form.value.preg_check_method = data.preg_check_method ?? null
      form.value.cost = data.cost ?? null
      form.value.notes = data.notes ?? ''

      if (data.calving_details) {
        const cd = typeof data.calving_details === 'string'
          ? JSON.parse(data.calving_details)
          : data.calving_details
        form.value.calving_details = {
          calf_sex: cd.calf_sex ?? null,
          calf_tag_number: cd.calf_tag_number ?? '',
          calf_weight: cd.calf_weight ?? null,
        }
      }

      editCowLabel.value = data.tag_number
        ? `${data.tag_number}${data.cow_name ? ` · ${data.cow_name}` : ''}`
        : data.cow_id
    } catch {
      submitError.value = t('common.errorLoading')
    } finally {
      loadingEvent.value = false
    }
  } else {
    if (route.query.cow_id) {
      form.value.cow_id = String(route.query.cow_id)
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
  font-size: 1.4rem;
  line-height: 1;
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

.submit-error {
  color: var(--danger);
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
</style>
