<template>
  <div class="page">
    <AppHeader :title="$t('globalDefaults.medications')" show-back back-to="/super/defaults" />

    <div class="page-content defaults-content">
      <!-- Add / Edit Form -->
      <div v-if="showForm" class="card form-card">
        <h3 class="form-title">{{ editing ? $t('common.edit') : $t('common.add') }}</h3>
        <form @submit.prevent="save">
          <div class="form-group">
            <label for="med-name">{{ $t('medications.name') }} *</label>
            <input id="med-name" v-model="form.name" class="form-input" required />
          </div>

          <div class="form-group">
            <label for="med-ingredient">{{ $t('medications.activeIngredient') }}</label>
            <input id="med-ingredient" v-model="form.active_ingredient" class="form-input" />
          </div>

          <div class="form-group">
            <label>{{ $t('medications.withdrawalMilk') }} *</label>
            <div class="withdrawal-inputs">
              <div class="input-unit">
                <input v-model.number="form.withdrawal_milk_hours" type="number" min="0" class="form-input" required />
                <span class="unit-label">{{ $t('medications.hours') }}</span>
              </div>
              <div class="input-unit">
                <input v-model.number="form.withdrawal_milk_days" type="number" min="0" class="form-input" />
                <span class="unit-label">{{ $t('medications.days') }}</span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>{{ $t('medications.withdrawalMeat') }} *</label>
            <div class="withdrawal-inputs">
              <div class="input-unit">
                <input v-model.number="form.withdrawal_meat_hours" type="number" min="0" class="form-input" />
                <span class="unit-label">{{ $t('medications.hours') }}</span>
              </div>
              <div class="input-unit">
                <input v-model.number="form.withdrawal_meat_days" type="number" min="0" class="form-input" required />
                <span class="unit-label">{{ $t('medications.days') }}</span>
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="med-dosage">{{ $t('medications.defaultDosage') }}</label>
              <input id="med-dosage" v-model="form.default_dosage" class="form-input" />
            </div>
            <div class="form-group">
              <label for="med-unit">{{ $t('medications.unit') }}</label>
              <input id="med-unit" v-model="form.unit" class="form-input" placeholder="e.g. ml, mg" />
            </div>
          </div>

          <div class="form-group">
            <label for="med-notes">{{ $t('common.notes') }}</label>
            <textarea id="med-notes" v-model="form.notes" class="form-input" rows="2" />
          </div>

          <p v-if="formError" class="form-error">{{ formError }}</p>

          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="showForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? $t('common.saving') : $t('common.save') }}
            </button>
          </div>
        </form>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="spinner-wrap"><div class="spinner" /></div>

      <!-- List -->
      <template v-else-if="!showForm">
        <div v-if="items.length === 0" class="empty-state">
          <p>{{ $t('globalDefaults.noItems') }}</p>
        </div>

        <div v-else class="defaults-list">
          <div v-for="med in items" :key="med.id" class="card defaults-card" :class="{ inactive: !med.is_active }">
            <div class="defaults-header">
              <div>
                <span class="defaults-name">{{ med.name }}</span>
                <span v-if="med.active_ingredient" class="defaults-sub">{{ med.active_ingredient }}</span>
              </div>
              <span class="badge" :class="med.is_active ? 'badge-active' : 'badge-inactive'">
                {{ med.is_active ? $t('common.active') : $t('common.inactive') }}
              </span>
            </div>

            <div class="withdrawal-info">
              <span v-if="med.withdrawal_milk_hours > 0 || med.withdrawal_milk_days > 0" class="withdrawal-pill milk">
                🥛 <template v-if="med.withdrawal_milk_days > 0">{{ med.withdrawal_milk_days }}d </template><template v-if="med.withdrawal_milk_hours > 0">{{ med.withdrawal_milk_hours }}h</template>
              </span>
              <span v-if="med.withdrawal_meat_hours > 0 || med.withdrawal_meat_days > 0" class="withdrawal-pill meat">
                🥩 <template v-if="med.withdrawal_meat_days > 0">{{ med.withdrawal_meat_days }}d </template><template v-if="med.withdrawal_meat_hours > 0">{{ med.withdrawal_meat_hours }}h</template>
              </span>
              <span v-if="!med.withdrawal_milk_hours && !med.withdrawal_milk_days && !med.withdrawal_meat_hours && !med.withdrawal_meat_days" class="withdrawal-pill none">
                {{ $t('medications.noWithdrawal') }}
              </span>
            </div>

            <div class="defaults-actions">
              <button class="btn-secondary btn-sm" @click="openEdit(med)">{{ $t('common.edit') }}</button>
              <button v-if="med.is_active" class="btn-danger btn-sm" @click="confirmDeactivate(med)">{{ $t('medications.deactivate') }}</button>
              <template v-else>
                <button class="btn-primary btn-sm" :disabled="activating === med.id" @click="doActivate(med)">{{ $t('common.activate') }}</button>
                <button class="btn-danger btn-sm" @click="confirmDelete(med)">{{ $t('common.delete') }}</button>
              </template>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- FAB -->
    <button v-if="!showForm" class="fab" :title="$t('common.add')" @click="openAdd">+</button>

    <!-- Deactivate Confirm -->
    <ConfirmDialog
      :show="!!deactivateTarget"
      :message="deactivateTarget ? $t('medications.deactivateConfirm', { name: deactivateTarget.name }) : ''"
      :confirm-label="$t('medications.deactivate')"
      :cancel-label="$t('common.cancel')"
      :loading="deactivating"
      @confirm="doDeactivate"
      @cancel="deactivateTarget = null"
    />

    <!-- Delete Confirm -->
    <ConfirmDialog
      :show="!!deleteTarget"
      :message="deleteTarget ? $t('globalDefaults.deleteConfirm', { name: deleteTarget.name }) : ''"
      :confirm-label="$t('common.delete')"
      :cancel-label="$t('common.cancel')"
      :loading="deleting"
      @confirm="doDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api'
import AppHeader from '../../components/organisms/AppHeader.vue'
import ConfirmDialog from '../../components/molecules/ConfirmDialog.vue'
import { extractApiError, resolveError } from '../../utils/apiError'
import { useToast } from '../../composables/useToast.js'

const { t } = useI18n()
const { showToast } = useToast()

const items = ref([])
const loading = ref(true)
const showForm = ref(false)
const editing = ref(null)
const saving = ref(false)
const formError = ref('')
const deactivateTarget = ref(null)
const deactivating = ref(false)
const activating = ref(null)
const deleteTarget = ref(null)
const deleting = ref(false)

const emptyForm = () => ({
  name: '', active_ingredient: '',
  withdrawal_milk_hours: 0, withdrawal_milk_days: 0,
  withdrawal_meat_hours: 0, withdrawal_meat_days: 0,
  default_dosage: '', unit: '', notes: '',
})

const form = ref(emptyForm())

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/global-defaults/medications?all=1')
    items.value = data
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)

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
    default_dosage: med.default_dosage || '',
    unit: med.unit || '',
    notes: med.notes || '',
  }
  formError.value = ''
  showForm.value = true
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
      default_dosage: form.value.default_dosage || null,
      unit: form.value.unit || null,
      notes: form.value.notes || null,
    }
    if (editing.value) {
      await api.patch(`/global-defaults/medications/${editing.value.id}`, payload)
    } else {
      await api.post('/global-defaults/medications', payload)
    }
    showForm.value = false
    await load()
  } catch (err) {
    formError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

function confirmDeactivate(med) { deactivateTarget.value = med }

async function doActivate(med) {
  activating.value = med.id
  try {
    await api.patch(`/global-defaults/medications/${med.id}`, { is_active: true })
    await load()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    activating.value = null
  }
}

async function doDeactivate() {
  deactivating.value = true
  try {
    await api.delete(`/global-defaults/medications/${deactivateTarget.value.id}`)
    deactivateTarget.value = null
    await load()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deactivating.value = false
  }
}

function confirmDelete(med) { deleteTarget.value = med }

async function doDelete() {
  deleting.value = true
  try {
    await api.delete(`/global-defaults/medications/${deleteTarget.value.id}?hard=1`)
    deleteTarget.value = null
    await load()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.defaults-content { padding-bottom: 100px; }
.form-card { margin: 0 auto 20px; padding: 20px; max-width: 600px; }
.form-title { margin: 0 0 16px; font-size: 1rem; font-weight: 600; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.withdrawal-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.input-unit { display: flex; align-items: center; gap: 8px; }
.input-unit .form-input { flex: 1; }
.unit-label { font-size: 0.85rem; color: var(--text-muted); white-space: nowrap; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; }
.form-actions .btn-primary, .form-actions .btn-secondary { width: auto; padding: 10px 20px; }
.spinner-wrap { display: flex; justify-content: center; padding: 40px; }
.defaults-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.defaults-card { padding: 16px; display: flex; flex-direction: column; }
.defaults-card.inactive { opacity: 0.6; }
.defaults-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.defaults-name { font-weight: 600; font-size: 1rem; display: block; }
.defaults-sub { font-size: 0.8rem; color: var(--text-muted); display: block; margin-top: 2px; }
.withdrawal-info { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.withdrawal-pill { font-size: 0.8rem; font-family: var(--font-mono); padding: 4px 10px; border-radius: var(--radius-full); font-weight: 500; }
.withdrawal-pill.milk { background: var(--warning-light); color: var(--warning); }
.withdrawal-pill.meat { background: var(--danger-light); color: var(--danger); }
.withdrawal-pill.none { background: var(--success-light); color: var(--primary-dark); }
.defaults-actions { display: flex; gap: 8px; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border); }
.badge-active { background: var(--success-light); color: var(--primary-dark); }
.badge-inactive { background: var(--border); color: var(--text-secondary); }
</style>
