<template>
  <div class="page">
    <AppHeader :title="$t('treatments.logTitle')" show-back :back-to="backRoute" />

    <div class="content">
      <form @submit.prevent="submit">
        <!-- Cow selector -->
        <div data-tour="treat-cow" class="form-group">
          <label>{{ animalLabel }} *</label>
          <AnimalSearchDropdown
            v-model="form.cow_id"
            :placeholder="$t('treatments.cowPlaceholder', { animal: animalLabel })"
            :error="errors.cow_id"
          />
        </div>

        <!-- Medications list (one row per medication) -->
        <div data-tour="treat-medication" class="form-group">
          <label>{{ $t('treatments.medications') }} *</label>

          <div v-for="(item, index) in form.medications" :key="index" class="med-row">
            <div class="med-row-inputs">
              <select
                v-model="item.medication_id"
                class="form-input med-select"
                @focus="item._prevMedId = item.medication_id"
                @change="onMedChange(index, item._prevMedId)"
              >
                <option value="">{{ $t('treatments.selectMedication') }}</option>
                <option v-for="med in medications" :key="med.id" :value="med.id">
                  {{ med.name }}{{ med.active_ingredient ? ` (${med.active_ingredient})` : '' }}
                </option>
              </select>
              <div class="dosage-with-unit">
                <input
                  v-model="item.dosage"
                  type="number"
                  min="0"
                  step="any"
                  class="form-input dosage-input"
                  :placeholder="$t('treatments.dosagePlaceholder')"
                />
                <span v-if="item.unit" class="dosage-unit">{{ item.unit }}</span>
              </div>
            </div>
            <button
              v-if="form.medications.length > 1"
              type="button"
              class="btn-remove-med"
              :aria-label="$t('treatments.removeMedication')"
              @click="removeMed(index)"
            >
              ×
            </button>
          </div>

          <button type="button" class="btn-add-med" @click="addMed">
            + {{ $t('treatments.addMedication') }}
          </button>

          <span v-if="errors.medications" class="field-error">{{ errors.medications }}</span>
        </div>

        <!-- Treatment date -->
        <div class="form-group">
          <label for="treatment-date">{{ $t('treatments.treatmentDate') }} *</label>
          <input
            id="treatment-date"
            v-model="form.treatment_date"
            type="datetime-local"
            class="form-input"
            required
          />
        </div>

        <!-- Withdrawal preview — reactive, reflects worst-case across all selected medications -->
        <div
          v-if="anyMedSelected"
          class="withdrawal-preview"
          :class="{ 'has-withdrawal': hasWithdrawal }"
        >
          <div class="preview-icon">
            <AppIcon v-if="hasWithdrawal" name="alert-triangle" :size="22" />
            <AppIcon v-else name="check-circle" :size="22" />
          </div>
          <div class="preview-text">
            <template v-if="hasWithdrawal">
              <strong>{{ $t('treatments.withdrawalWarning') }}</strong>
              <div v-if="previewMilkEnd" class="preview-date">
                <AppIcon name="droplets" :size="14" />
                {{ $t('treatments.milkClear') }}:
                <span class="mono">{{ formatDateTime(previewMilkEnd) }}</span>
              </div>
              <div v-if="previewMeatEnd" class="preview-date">
                <AppIcon name="utensils" :size="14" />
                {{ $t('treatments.meatClear') }}:
                <span class="mono">{{ formatDateTime(previewMeatEnd) }}</span>
              </div>
            </template>
            <template v-else>
              {{ $t('treatments.noWithdrawal') }}
            </template>
          </div>
        </div>

        <!-- Cost (per visit, not per medication) -->
        <div data-tour="treat-dosage" class="form-group">
          <label for="cost">{{ $t('treatments.cost') }}</label>
          <input
            id="cost"
            v-model.number="form.cost"
            type="number"
            min="0"
            step="0.01"
            class="form-input"
            placeholder="0.00"
          />
        </div>

        <!-- Vet visit -->
        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="form.is_vet_visit" type="checkbox" />
            {{ $t('treatments.isVetVisit') }}
          </label>
        </div>

        <div v-if="form.is_vet_visit" class="form-group">
          <label for="vet-name">{{ $t('treatments.vetName') }}</label>
          <input
            id="vet-name"
            v-model="form.vet_name"
            class="form-input"
            :placeholder="$t('treatments.vetNamePlaceholder')"
          />
        </div>

        <!-- Link to health issue (optional, shown when cow is selected) -->
        <div
          v-if="form.cow_id && openIssues.length"
          data-tour="treat-health-link"
          class="form-group"
        >
          <label for="health-issue">{{ $t('healthIssues.linkIssue') }}</label>
          <select id="health-issue" v-model="form.health_issue_id" class="form-input">
            <option value="">{{ $t('healthIssues.noLinkIssue') }}</option>
            <option v-for="issue in openIssues" :key="issue.id" :value="issue.id">
              {{
                (issue.issue_types || [])
                  .map((c) => issueTypesStore.getByCode(c)?.emoji || '')
                  .join(' ')
              }}
              {{
                (issue.issue_types || [])
                  .map((c) => issueTypesStore.getByCode(c)?.name || c)
                  .join(' + ')
              }}
              — {{ formatDate(issue.observed_at) }}
            </option>
          </select>
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label for="notes">{{ $t('common.notes') }}</label>
          <textarea
            id="notes"
            v-model="form.notes"
            class="form-input"
            rows="2"
            :placeholder="$t('treatments.notesPlaceholder')"
          />
        </div>

        <p v-if="submitError" class="form-error">{{ submitError }}</p>

        <button
          data-tour="treat-save"
          type="submit"
          class="btn-primary btn-full"
          :disabled="submitting"
        >
          {{ submitting ? $t('common.saving') : $t('treatments.logTreatment') }}
        </button>
      </form>
    </div>

    <TourButton @start-tour="startTour" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMedicationsStore } from '../stores/medications'
import { useTreatmentsStore } from '../stores/treatments'
import { useHealthIssuesStore } from '../stores/healthIssues'
import { useIssueTypesStore } from '../stores/issueTypes'
import { formatDate, formatDateTime } from '../utils/format'
import AppHeader from '../components/organisms/AppHeader.vue'
import AnimalSearchDropdown from '../components/molecules/AnimalSearchDropdown.vue'
import TourButton from '../components/atoms/TourButton.vue'
import AppIcon from '../components/atoms/AppIcon.vue'
import { extractApiError, resolveError } from '../utils/apiError'
import { useTour } from '../composables/useTour'
import { useSpeciesTerms } from '../composables/useSpeciesTerms'

const { t } = useI18n()
const { singular: animalLabel } = useSpeciesTerms()
const route = useRoute()
const router = useRouter()
const medicationsStore = useMedicationsStore()
const treatmentsStore = useTreatmentsStore()
const healthIssuesStore = useHealthIssuesStore()
const issueTypesStore = useIssueTypesStore()

const { startTour } = useTour('treatments', () => [
  {
    element: '[data-tour="treat-cow"]',
    popover: {
      title: t('tour.treatments.cowSelect.title', { animal: animalLabel.value }),
      description: t('tour.treatments.cowSelect.desc', { animal: animalLabel.value }),
    },
  },
  {
    element: '[data-tour="treat-medication"]',
    popover: {
      title: t('tour.treatments.medication.title'),
      description: t('tour.treatments.medication.desc'),
    },
  },
  {
    element: '[data-tour="treat-dosage"]',
    popover: {
      title: t('tour.treatments.dosage.title'),
      description: t('tour.treatments.dosage.desc'),
    },
  },
  {
    element: '[data-tour="treat-health-link"]',
    popover: {
      title: t('tour.treatments.healthLink.title'),
      description: t('tour.treatments.healthLink.desc'),
    },
  },
  {
    element: '[data-tour="treat-save"]',
    popover: {
      title: t('tour.treatments.save.title'),
      description: t('tour.treatments.save.desc'),
    },
  },
])

const medications = computed(() => medicationsStore.medications)

const prefillCowId = route.query.cow_id || route.query.animal_id || ''
const prefillHealthIssueId = route.query.health_issue_id || ''
const backRoute = prefillCowId ? `/animals/${prefillCowId}` : '/'

const form = ref({
  cow_id: prefillCowId,
  health_issue_id: prefillHealthIssueId,
  medications: [{ medication_id: '', dosage: '', unit: '' }],
  treatment_date: localNow(),
  cost: '',
  is_vet_visit: false,
  vet_name: '',
  notes: '',
})

// Fetch open/treating issues for the prefilled cow immediately (before the watch runs)
if (prefillCowId) healthIssuesStore.fetchByCow(prefillCowId)

// Reset health_issue_id only when the user manually changes the cow
watch(
  () => form.value.cow_id,
  (cowId) => {
    form.value.health_issue_id = ''
    if (cowId) healthIssuesStore.fetchByCow(cowId)
  }
)

const openIssues = computed(() => {
  if (!form.value.cow_id) return []
  return healthIssuesStore
    .getCowIssues(form.value.cow_id)
    .filter((i) => i.status === 'open' || i.status === 'treating')
})

const errors = ref({})
const submitting = ref(false)
const submitError = ref('')

// Clear server error when the user edits the form
watch(
  form,
  () => {
    submitError.value = ''
  },
  { deep: true }
)

const anyMedSelected = computed(() => form.value.medications.some((m) => m.medication_id !== ''))

// Shared helper: latest withdrawal end-date across all selected medications for a given field
function maxWithdrawalDate(field, multiplierMs) {
  if (!form.value.treatment_date) return null
  const base = new Date(form.value.treatment_date).getTime()
  let max = null
  for (const item of form.value.medications) {
    const med = medications.value.find((m) => m.id === item.medication_id)
    if (!med) continue
    const amount = med[field] || 0
    if (amount === 0) continue
    const end = new Date(base + amount * multiplierMs)
    if (!max || end > max) max = end
  }
  return max
}

const previewMilkEnd = computed(() => maxWithdrawalDate('withdrawal_milk_hours', 3_600_000))
const previewMeatEnd = computed(() => maxWithdrawalDate('withdrawal_meat_days', 86_400_000))
const hasWithdrawal = computed(() => previewMilkEnd.value !== null || previewMeatEnd.value !== null)

onMounted(() => {
  medicationsStore.fetchAll()
  if (!issueTypesStore.hasData) issueTypesStore.fetchAll()
})

function localNow() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function addMed() {
  form.value.medications.push({ medication_id: '', dosage: '', unit: '' })
}

function removeMed(index) {
  form.value.medications.splice(index, 1)
}

function onMedChange(index, prevMedId) {
  const item = form.value.medications[index]
  const med = medications.value.find((m) => m.id === item.medication_id)
  // Always sync unit from selected medication (clear if none selected)
  item.unit = med?.unit || ''
  if (!med) {
    item.dosage = ''
    return
  }
  // Auto-fill default dosage: always fill if empty, or if current value matches
  // the previous medication's default (i.e. it was auto-filled, not hand-edited)
  if (med.default_dosage) {
    const numeric = parseFloat(String(med.default_dosage))
    if (isNaN(numeric)) return
    const prevMed = prevMedId ? medications.value.find((m) => m.id === prevMedId) : null
    const prevDefault = prevMed?.default_dosage ? parseFloat(String(prevMed.default_dosage)) : null
    const currentDosage = item.dosage ? parseFloat(item.dosage) : null
    if (!item.dosage || currentDosage === prevDefault) {
      item.dosage = String(numeric)
    }
  }
}

async function submit() {
  errors.value = {}
  submitError.value = ''

  // Validate cow is selected
  const cowId = form.value.cow_id?.toString().trim() || ''
  if (!cowId) {
    errors.value.cow_id = t('common.required')
  }

  // Filter to only medications with a valid medication_id (truthy and not just whitespace)
  const validMeds = form.value.medications.filter((m) => {
    const medId = m.medication_id?.toString().trim()
    return medId && medId !== ''
  })
  if (!validMeds.length) {
    errors.value.medications = t('common.required')
  }

  if (Object.keys(errors.value).length) return

  submitting.value = true
  const payload = {
    cow_id: cowId,
    health_issue_id: form.value.health_issue_id || null,
    medications: validMeds.map((m) => ({
      medication_id: m.medication_id.toString().trim(),
      dosage: m.dosage?.toString().trim() || null,
    })),
    treatment_date: new Date(form.value.treatment_date).toISOString(),
    cost: form.value.cost !== '' ? form.value.cost : null,
    is_vet_visit: form.value.is_vet_visit,
    vet_name: form.value.vet_name || null,
    notes: form.value.notes || null,
  }
  try {
    await treatmentsStore.create(payload)
    router.replace(backRoute)
  } catch (err) {
    submitError.value = resolveError(extractApiError(err), t)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.content {
  padding: 80px 16px 100px;
  max-width: 540px;
  margin: 0 auto;
}

.field-error {
  color: var(--danger);
  font-size: 0.8rem;
  margin-top: 4px;
  display: block;
}

/* Medication rows */
.med-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.med-row-inputs {
  display: grid;
  grid-template-columns: 1fr 120px;
  gap: 8px;
  flex: 1;
}

.dosage-with-unit {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dosage-with-unit .form-input {
  flex: 1;
  min-width: 0;
}

.dosage-unit {
  font-size: 0.85rem;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-remove-med {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--danger-light);
  color: var(--danger);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-add-med {
  background: none;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--primary);
  font-size: 0.9rem;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
  width: 100%;
  margin-top: 2px;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.btn-add-med:hover {
  border-color: var(--primary);
  background: var(--success-light);
}

/* Withdrawal preview */
.withdrawal-preview {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 16px;
  border-radius: var(--radius);
  margin-bottom: 4px;
  background: var(--success-light);
  border: 1.5px solid #a5d6a7;
}

.withdrawal-preview.has-withdrawal {
  background: var(--danger-light);
  border-color: #ef9a9a;
}

.preview-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.preview-text {
  font-size: 0.9rem;
  line-height: 1.5;
}

.preview-text strong {
  display: block;
  margin-bottom: 4px;
  color: var(--danger);
}

.preview-date {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
  cursor: pointer;
}

.checkbox-label input {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}

.btn-full {
  width: 100%;
  padding: 16px;
  font-size: 1rem;
  margin-top: 8px;
}
</style>
