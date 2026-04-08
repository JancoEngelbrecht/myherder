<template>
  <div class="page">
    <AppHeader :title="$t('medications.title')" show-back back-to="/settings" />

    <div class="page-content med-content">
      <!-- Add / Edit Form -->
      <div v-if="showForm" class="card form-card">
        <h3 class="form-title">
          {{ editing ? $t('medications.editTitle') : $t('medications.addTitle') }}
        </h3>
        <form @submit.prevent="save">
          <div class="form-group">
            <label for="med-name">{{ $t('medications.name') }} *</label>
            <input
              id="med-name"
              v-model="form.name"
              class="form-input"
              required
              :placeholder="$t('medications.namePlaceholder')"
            />
          </div>

          <div class="form-group">
            <label for="med-ingredient">{{ $t('medications.activeIngredient') }}</label>
            <input
              id="med-ingredient"
              v-model="form.active_ingredient"
              class="form-input"
              :placeholder="$t('medications.activeIngredientPlaceholder')"
            />
          </div>

          <div class="form-group">
            <label>{{ $t('medications.withdrawalMilk') }} *</label>
            <div class="withdrawal-inputs">
              <div class="input-unit">
                <input
                  id="milk-hours"
                  v-model.number="form.withdrawal_milk_hours"
                  type="number"
                  min="0"
                  class="form-input"
                  required
                />
                <span class="unit-label">{{ $t('medications.hours') }}</span>
              </div>
              <div class="input-unit">
                <input
                  id="milk-days"
                  v-model.number="form.withdrawal_milk_days"
                  type="number"
                  min="0"
                  class="form-input"
                  required
                />
                <span class="unit-label">{{ $t('medications.days') }}</span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>{{ $t('medications.withdrawalMeat') }} *</label>
            <div class="withdrawal-inputs">
              <div class="input-unit">
                <input
                  id="meat-hours"
                  v-model.number="form.withdrawal_meat_hours"
                  type="number"
                  min="0"
                  class="form-input"
                  required
                />
                <span class="unit-label">{{ $t('medications.hours') }}</span>
              </div>
              <div class="input-unit">
                <input
                  id="meat-days"
                  v-model.number="form.withdrawal_meat_days"
                  type="number"
                  min="0"
                  class="form-input"
                  required
                />
                <span class="unit-label">{{ $t('medications.days') }}</span>
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="med-dosage">{{ $t('medications.defaultDosage') }}</label>
              <div class="input-unit">
                <input
                  id="med-dosage"
                  v-model.number="form.default_dosage"
                  type="number"
                  min="0"
                  step="any"
                  class="form-input"
                  placeholder="0"
                />
                <span v-if="form.unit" class="unit-label">{{ form.unit }}</span>
              </div>
            </div>
            <div class="form-group">
              <label for="med-unit">{{ $t('medications.unit') }}</label>
              <input
                id="med-unit"
                v-model="form.unit"
                class="form-input"
                placeholder="e.g. ml, mg"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="med-notes">{{ $t('common.notes') }}</label>
            <textarea id="med-notes" v-model="form.notes" class="form-input" rows="2" />
          </div>

          <p v-if="formError" class="form-error">{{ formError }}</p>

          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="cancelForm">
              {{ $t('common.cancel') }}
            </button>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? $t('common.saving') : $t('common.save') }}
            </button>
          </div>
        </form>
      </div>

      <!-- Search (hidden while form is open) -->
      <div v-if="!showForm" data-tour="med-search" class="search-bar">
        <SearchInput
          v-model="searchQuery"
          :placeholder="$t('common.search.placeholder')"
          @update:model-value="onSearch"
        />
      </div>

      <!-- Loading -->
      <div v-if="loading" class="spinner-wrap"><div class="spinner" /></div>

      <!-- Empty -->
      <div v-else-if="!showForm && allMedications.length === 0" class="empty-state">
        <p>{{ $t('medications.empty') }}</p>
      </div>

      <!-- List -->
      <div v-else-if="!showForm" data-tour="med-list" class="med-list">
        <div
          v-for="med in allMedications"
          :key="med.id"
          class="card med-card"
          :class="{ inactive: !med.is_active }"
        >
          <div class="med-header">
            <div>
              <span class="med-name">{{ med.name }}</span>
              <span v-if="med.active_ingredient" class="med-ingredient">{{
                med.active_ingredient
              }}</span>
            </div>
            <span class="badge" :class="med.is_active ? 'badge-active' : 'badge-inactive'">
              {{ med.is_active ? $t('common.active') : $t('common.inactive') }}
            </span>
          </div>

          <div data-tour="med-withdrawal" class="withdrawal-info">
            <span
              v-if="med.withdrawal_milk_hours > 0 || med.withdrawal_milk_days > 0"
              class="withdrawal-pill milk"
            >
              <AppIcon name="droplets" :size="13" />
              <template v-if="med.withdrawal_milk_days > 0"
                >{{ med.withdrawal_milk_days }}d </template
              ><template v-if="med.withdrawal_milk_hours > 0"
                >{{ med.withdrawal_milk_hours }}h </template
              >{{ $t('medications.milkWithdrawal') }}
            </span>
            <span
              v-if="med.withdrawal_meat_hours > 0 || med.withdrawal_meat_days > 0"
              class="withdrawal-pill meat"
            >
              <AppIcon name="utensils" :size="13" />
              <template v-if="med.withdrawal_meat_days > 0"
                >{{ med.withdrawal_meat_days }}d </template
              ><template v-if="med.withdrawal_meat_hours > 0"
                >{{ med.withdrawal_meat_hours }}h </template
              >{{ $t('medications.meatWithdrawal') }}
            </span>
            <span
              v-if="
                med.withdrawal_milk_hours === 0 &&
                med.withdrawal_milk_days === 0 &&
                med.withdrawal_meat_hours === 0 &&
                med.withdrawal_meat_days === 0
              "
              class="withdrawal-pill none"
            >
              {{ $t('medications.noWithdrawal') }}
            </span>
          </div>

          <div v-if="med.default_dosage" class="med-dosage">
            {{ $t('medications.defaultDosage') }}:
            <span class="mono"
              >{{ parseFloat(med.default_dosage) }}{{ med.unit ? ` ${med.unit}` : '' }}</span
            >
          </div>

          <div class="med-actions">
            <button class="btn-secondary btn-sm" @click="openEdit(med)">
              {{ $t('common.edit') }}
            </button>
            <button v-if="med.is_active" class="btn-danger btn-sm" @click="confirmDeactivate(med)">
              {{ $t('medications.deactivate') }}
            </button>
            <button class="btn-danger btn-sm" @click="confirmDelete(med)">
              {{ $t('common.delete') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <PaginationBar
        v-if="!showForm"
        :total="store.total"
        :page="page"
        :limit="limit"
        @update:page="onPageChange"
        @update:limit="onLimitChange"
      />
    </div>

    <!-- FAB -->
    <button
      v-if="!showForm"
      data-tour="med-add"
      class="fab"
      :title="$t('medications.addMedication')"
      @click="openAdd"
    >
      +
    </button>

    <TourButton above-fab @start-tour="startTour" />

    <!-- Delete ConfirmDialog -->
    <ConfirmDialog
      :show="!!deleteTarget"
      :message="deleteTarget ? $t('medications.deleteConfirm', { name: deleteTarget.name }) : ''"
      :confirm-label="$t('common.delete')"
      :cancel-label="$t('common.cancel')"
      :loading="deleting"
      @confirm="doDelete"
      @cancel="deleteTarget = null"
    />

    <!-- Deactivate ConfirmDialog -->
    <ConfirmDialog
      :show="!!deactivateTarget"
      :message="
        deactivateTarget ? $t('medications.deactivateConfirm', { name: deactivateTarget.name }) : ''
      "
      :confirm-label="$t('medications.deactivate')"
      :cancel-label="$t('common.cancel')"
      :loading="deactivating"
      @confirm="doDeactivate"
      @cancel="deactivateTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMedicationsStore } from '../../stores/medications'
import AppHeader from '../../components/organisms/AppHeader.vue'
import AppIcon from '../../components/atoms/AppIcon.vue'
import TourButton from '../../components/atoms/TourButton.vue'
import ConfirmDialog from '../../components/molecules/ConfirmDialog.vue'
import SearchInput from '../../components/atoms/SearchInput.vue'
import PaginationBar from '../../components/atoms/PaginationBar.vue'
import { useI18n } from 'vue-i18n'
import { extractApiError, resolveError } from '../../utils/apiError'
import { useToast } from '../../composables/useToast'
import { useTour } from '../../composables/useTour'

const { t } = useI18n()
const { showToast } = useToast()

const { startTour } = useTour(
  'medication-management',
  () => [
    {
      element: '[data-tour="med-search"]',
      popover: {
        title: t('tour.medicationManagement.search.title'),
        description: t('tour.medicationManagement.search.desc'),
      },
    },
    {
      element: '[data-tour="med-list"]',
      popover: {
        title: t('tour.medicationManagement.list.title'),
        description: t('tour.medicationManagement.list.desc'),
      },
    },
    {
      element: '[data-tour="med-withdrawal"]',
      popover: {
        title: t('tour.medicationManagement.withdrawal.title'),
        description: t('tour.medicationManagement.withdrawal.desc'),
      },
    },
    {
      element: '[data-tour="med-add"]',
      popover: {
        title: t('tour.medicationManagement.add.title'),
        description: t('tour.medicationManagement.add.desc'),
      },
    },
  ],
  { autoStart: false }
)
const store = useMedicationsStore()

const loading = computed(() => store.loading)
const allMedications = computed(() => store.medications)

const searchQuery = ref('')
const page = ref(1)
const limit = ref(20)

function loadMedications() {
  store.fetchAll(true, {
    search: searchQuery.value || undefined,
    page: page.value,
    limit: limit.value,
  })
}

function onSearch() {
  page.value = 1
  loadMedications()
}

function onPageChange(p) {
  page.value = p
  loadMedications()
}

function onLimitChange(l) {
  limit.value = l
  page.value = 1
  loadMedications()
}

const showForm = ref(false)
const editing = ref(null)
const saving = ref(false)
const formError = ref('')
const deactivateTarget = ref(null)
const deactivating = ref(false)
const deleteTarget = ref(null)
const deleting = ref(false)

function emptyForm() {
  return {
    name: '',
    active_ingredient: '',
    withdrawal_milk_hours: 0,
    withdrawal_milk_days: 0,
    withdrawal_meat_hours: 0,
    withdrawal_meat_days: 0,
    default_dosage: null,
    unit: '',
    notes: '',
    is_active: true,
  }
}

const form = ref(emptyForm())

onMounted(loadMedications)

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  formError.value = ''
  showForm.value = true
}

function openEdit(med) {
  editing.value = med
  form.value = {
    name: med.name,
    active_ingredient: med.active_ingredient || '',
    withdrawal_milk_hours: med.withdrawal_milk_hours,
    withdrawal_milk_days: med.withdrawal_milk_days ?? 0,
    withdrawal_meat_hours: med.withdrawal_meat_hours ?? 0,
    withdrawal_meat_days: med.withdrawal_meat_days,
    default_dosage: med.default_dosage != null ? Number(med.default_dosage) : null,
    unit: med.unit || '',
    notes: med.notes || '',
    is_active: med.is_active,
  }
  formError.value = ''
  showForm.value = true
}

function cancelForm() {
  showForm.value = false
  editing.value = null
}

async function save() {
  saving.value = true
  formError.value = ''
  try {
    const payload = {
      name: form.value.name,
      active_ingredient: form.value.active_ingredient || null,
      withdrawal_milk_hours: form.value.withdrawal_milk_hours,
      withdrawal_milk_days: form.value.withdrawal_milk_days,
      withdrawal_meat_hours: form.value.withdrawal_meat_hours,
      withdrawal_meat_days: form.value.withdrawal_meat_days,
      default_dosage:
        form.value.default_dosage != null && form.value.default_dosage !== ''
          ? form.value.default_dosage
          : null,
      unit: form.value.unit || null,
      notes: form.value.notes || null,
      is_active: form.value.is_active ?? true,
    }
    if (editing.value) {
      await store.update(editing.value.id, payload)
    } else {
      await store.create(payload)
    }
    showForm.value = false
    editing.value = null
  } catch (err) {
    formError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

function confirmDeactivate(med) {
  deactivateTarget.value = med
}

async function doDeactivate() {
  deactivating.value = true
  try {
    await store.deactivate(deactivateTarget.value.id)
    deactivateTarget.value = null
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deactivating.value = false
  }
}

function confirmDelete(med) {
  deleteTarget.value = med
}

async function doDelete() {
  deleting.value = true
  try {
    await store.remove(deleteTarget.value.id)
    deleteTarget.value = null
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.med-content {
  padding-bottom: 100px;
}

.form-card {
  margin: 0 auto 20px;
  padding: 20px;
  max-width: 600px;
}

.form-title {
  margin: 0 0 16px;
  font-size: 1rem;
  font-weight: 600;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.withdrawal-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.input-unit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-unit .form-input {
  flex: 1;
}

.unit-label {
  font-size: 0.85rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 16px;
}

.form-actions .btn-primary,
.form-actions .btn-secondary {
  width: auto;
  padding: 10px 20px;
}

.search-bar {
  margin-bottom: 16px;
}

.spinner-wrap {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.med-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.med-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.med-card.inactive {
  opacity: 0.6;
}

.med-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}

.med-name {
  font-weight: 600;
  font-size: 1rem;
  display: block;
}

.med-ingredient {
  font-size: 0.8rem;
  color: var(--text-muted);
  display: block;
  margin-top: 2px;
}

.withdrawal-info {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.withdrawal-pill {
  font-size: 0.8rem;
  font-family: var(--font-mono);
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-weight: 500;
}

.withdrawal-pill.milk {
  background: var(--warning-light);
  color: var(--warning);
}

.withdrawal-pill.meat {
  background: var(--danger-light);
  color: var(--danger);
}

.withdrawal-pill.none {
  background: var(--success-light);
  color: var(--primary);
}

.med-dosage {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 12px;
  flex: 1;
}

.med-actions {
  display: flex;
  gap: 8px;
}

.badge-active {
  background: var(--success-light);
  color: var(--primary-dark);
}

.badge-inactive {
  background: var(--border);
  color: var(--text-secondary);
}
</style>
