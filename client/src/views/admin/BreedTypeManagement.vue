<template>
  <div class="page">
    <AppHeader :title="t('breedTypes.title')" show-back back-to="/settings" />

    <div class="page-content bt-content">
      <!-- Add / Edit form -->
      <div v-if="formMode" class="card form-card">
        <h3 class="form-title">
          {{ formMode === 'add' ? t('breedTypes.addTitle') : t('breedTypes.editTitle') }}
        </h3>
        <form @submit.prevent="save">
          <div class="form-group">
            <label for="bt-name">{{ t('breedTypes.name') }} *</label>
            <input
              id="bt-name"
              v-model="form.name"
              class="form-input"
              required
              maxlength="100"
              :placeholder="t('breedTypes.namePlaceholder')"
            />
          </div>

          <div v-if="formMode === 'edit'" class="form-group">
            <label class="info-label">{{ t('breedTypes.code') }}</label>
            <span class="code-badge mono">{{ editing.code }}</span>
          </div>

          <h4 class="section-label">{{ t('breedTypes.timingDefaults') }}</h4>

          <div class="timing-grid">
            <div class="form-group">
              <label for="bt-heat">{{ t('breedTypes.heatCycleDays') }}</label>
              <input
                id="bt-heat"
                v-model.number="form.heat_cycle_days"
                type="number"
                min="1"
                max="60"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label for="bt-gestation">{{ t('breedTypes.gestationDays') }}</label>
              <input
                id="bt-gestation"
                v-model.number="form.gestation_days"
                type="number"
                min="200"
                max="400"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label for="bt-preg">{{ t('breedTypes.pregCheckDays') }}</label>
              <input
                id="bt-preg"
                v-model.number="form.preg_check_days"
                type="number"
                min="14"
                max="90"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label for="bt-vwd">{{ t('breedTypes.voluntaryWaitingDays') }}</label>
              <input
                id="bt-vwd"
                v-model.number="form.voluntary_waiting_days"
                type="number"
                min="0"
                max="120"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label for="bt-dry">{{ t('breedTypes.dryOffDays') }}</label>
              <input
                id="bt-dry"
                v-model.number="form.dry_off_days"
                type="number"
                min="0"
                max="120"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label for="bt-calf">{{ t('breedTypes.calfMaxMonths') }}</label>
              <input
                id="bt-calf"
                v-model.number="form.calf_max_months"
                type="number"
                min="1"
                max="24"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label for="bt-heifer">{{ t('breedTypes.heiferMinMonths') }}</label>
              <input
                id="bt-heifer"
                v-model.number="form.heifer_min_months"
                type="number"
                min="6"
                max="48"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label for="bt-ybull">{{ t('breedTypes.youngBullMinMonths') }}</label>
              <input
                id="bt-ybull"
                v-model.number="form.young_bull_min_months"
                type="number"
                min="6"
                max="48"
                class="form-input"
              />
            </div>
          </div>

          <div class="form-row-inline">
            <div class="form-group">
              <label for="bt-order">{{ t('breedTypes.sortOrder') }}</label>
              <input
                id="bt-order"
                v-model.number="form.sort_order"
                type="number"
                min="0"
                class="form-input sort-input"
              />
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input v-model="form.is_active" type="checkbox" />
                {{ t('common.active') }}
              </label>
            </div>
          </div>

          <p v-if="formError" class="form-error">{{ formError }}</p>

          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="cancelForm">
              {{ t('common.cancel') }}
            </button>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? t('common.saving') : t('common.save') }}
            </button>
          </div>
        </form>
      </div>

      <!-- Loading -->
      <div v-else-if="store.loading" class="spinner-wrap"><div class="spinner" /></div>

      <!-- List -->
      <template v-else>
        <div data-tour="bt-list" class="bt-list">
          <div
            v-for="bt in store.types"
            :key="bt.id"
            class="card bt-card"
            :class="{ inactive: !bt.is_active }"
          >
            <div class="bt-header">
              <div class="bt-info">
                <span class="bt-name">{{ bt.name }}</span>
                <span class="bt-code mono">{{ bt.code }}</span>
              </div>
              <span class="badge" :class="bt.is_active ? 'badge-active' : 'badge-inactive'">
                {{ bt.is_active ? t('common.active') : t('common.inactive') }}
              </span>
            </div>
            <div data-tour="bt-timing" class="timing-summary mono">
              <span>{{ bt.gestation_days }}d gest</span>
              <span>{{ bt.heat_cycle_days }}d heat</span>
              <span>{{ bt.preg_check_days }}d preg</span>
              <span>{{ bt.dry_off_days }}d dry</span>
            </div>
            <div class="bt-actions">
              <button class="btn-secondary btn-sm" @click="openEdit(bt)">
                {{ t('common.edit') }}
              </button>
              <button class="btn-danger btn-sm" @click="confirmDelete(bt)">
                {{ t('common.delete') }}
              </button>
            </div>
          </div>
        </div>

        <!-- FAB to add -->
        <button data-tour="bt-add" class="fab" :title="$t('breedTypes.addTitle')" @click="openAdd">
          +
        </button>
      </template>
    </div>

    <TourButton above-fab @start-tour="startTour" />

    <ConfirmDialog
      :show="!!deleting"
      :message="deleteMessage"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      :loading="deleteLoading"
      @confirm="executeDelete"
      @cancel="deleting = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import TourButton from '../../components/atoms/TourButton.vue'
import ConfirmDialog from '../../components/molecules/ConfirmDialog.vue'
import { useBreedTypesStore } from '../../stores/breedTypes'
import { extractApiError, resolveError } from '../../utils/apiError'
import { useTour } from '../../composables/useTour'

const { t } = useI18n()
const store = useBreedTypesStore()

const { startTour } = useTour(
  'breed-type-management',
  () => [
    {
      element: '[data-tour="bt-list"]',
      popover: {
        title: t('tour.breedTypeManagement.list.title'),
        description: t('tour.breedTypeManagement.list.desc'),
      },
    },
    {
      element: '[data-tour="bt-timing"]',
      popover: {
        title: t('tour.breedTypeManagement.timing.title'),
        description: t('tour.breedTypeManagement.timing.desc'),
      },
    },
    {
      element: '[data-tour="bt-add"]',
      popover: {
        title: t('tour.breedTypeManagement.add.title'),
        description: t('tour.breedTypeManagement.add.desc'),
      },
    },
  ],
  { autoStart: false }
)

const formMode = ref(null) // null | 'add' | 'edit'
const editing = ref(null)
const saving = ref(false)
const formError = ref('')

const deleting = ref(null)
const deleteMessage = ref('')
const deleteLoading = ref(false)

const defaultForm = {
  name: '',
  heat_cycle_days: 21,
  gestation_days: 283,
  preg_check_days: 35,
  voluntary_waiting_days: 45,
  dry_off_days: 60,
  calf_max_months: 6,
  heifer_min_months: 15,
  young_bull_min_months: 15,
  is_active: true,
  sort_order: 0,
}

const form = ref({ ...defaultForm })

onMounted(() => {
  if (store.types.length === 0) store.fetchAll()
})

function openAdd() {
  formMode.value = 'add'
  editing.value = null
  form.value = { ...defaultForm }
  formError.value = ''
}

function openEdit(bt) {
  formMode.value = 'edit'
  editing.value = bt
  form.value = {
    name: bt.name,
    heat_cycle_days: bt.heat_cycle_days,
    gestation_days: bt.gestation_days,
    preg_check_days: bt.preg_check_days,
    voluntary_waiting_days: bt.voluntary_waiting_days,
    dry_off_days: bt.dry_off_days,
    calf_max_months: bt.calf_max_months,
    heifer_min_months: bt.heifer_min_months,
    young_bull_min_months: bt.young_bull_min_months,
    is_active: bt.is_active,
    sort_order: bt.sort_order,
  }
  formError.value = ''
}

function cancelForm() {
  formMode.value = null
  editing.value = null
}

async function save() {
  saving.value = true
  formError.value = ''
  try {
    if (formMode.value === 'add') {
      await store.create(form.value)
    } else {
      await store.update(editing.value.id, form.value)
    }
    formMode.value = null
    editing.value = null
  } catch (err) {
    formError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

function confirmDelete(bt) {
  deleting.value = bt
  deleteMessage.value = t('breedTypes.deleteConfirm')
}

async function executeDelete() {
  deleteLoading.value = true
  try {
    await store.remove(deleting.value.id)
    deleting.value = null
  } catch (err) {
    deleteMessage.value = resolveError(extractApiError(err), t)
  } finally {
    deleteLoading.value = false
  }
}
</script>

<style scoped>
.bt-content {
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

.section-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 16px 0 10px;
}

.timing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}

.form-row-inline {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 12px;
}

.info-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.code-badge {
  display: inline-block;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-top: 4px;
}

.sort-input {
  max-width: 120px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  margin-top: 22px;
}

.form-group {
  margin-bottom: 8px;
}

.form-group label {
  font-size: 0.82rem;
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

.spinner-wrap {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.bt-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bt-card {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bt-card.inactive {
  opacity: 0.55;
}

.bt-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bt-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bt-name {
  font-weight: 600;
  font-size: 0.95rem;
}

.bt-code {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.badge-active {
  background: var(--success-light);
  color: var(--primary-dark);
}

.badge-inactive {
  background: var(--border);
  color: var(--text-secondary);
}

.timing-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.timing-summary span {
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 4px;
}

.bt-actions {
  display: flex;
  gap: 8px;
}
</style>
