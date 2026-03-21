<template>
  <div class="page">
    <AppHeader :title="$t('globalDefaults.breedTypes')" show-back back-to="/super/defaults" />

    <div class="page-content defaults-content">
      <!-- Add / Edit Form -->
      <div v-if="showForm" class="card form-card">
        <h3 class="form-title">{{ editing ? $t('common.edit') : $t('common.add') }}</h3>
        <form @submit.prevent="save">
          <div class="form-group">
            <label for="bt-name">{{ $t('breedTypes.name') }} *</label>
            <input id="bt-name" v-model="form.name" class="form-input" required />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="bt-gestation">{{ $t('breedTypes.gestationDays') }} *</label>
              <input id="bt-gestation" v-model.number="form.gestation_days" type="number" min="1" class="form-input" required />
            </div>
            <div class="form-group">
              <label for="bt-heat">{{ $t('breedTypes.heatCycleDays') }} *</label>
              <input id="bt-heat" v-model.number="form.heat_cycle_days" type="number" min="1" class="form-input" required />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="bt-preg">{{ $t('breedTypes.pregCheckDays') }}</label>
              <input id="bt-preg" v-model.number="form.preg_check_days" type="number" min="1" class="form-input" />
            </div>
            <div class="form-group">
              <label for="bt-dryoff">{{ $t('breedTypes.dryOffDays') }}</label>
              <input id="bt-dryoff" v-model.number="form.dry_off_days" type="number" min="0" class="form-input" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="bt-vwait">{{ $t('breedTypes.voluntaryWaitingDays') }}</label>
              <input id="bt-vwait" v-model.number="form.voluntary_waiting_days" type="number" min="0" class="form-input" />
            </div>
            <div class="form-group">
              <label for="bt-sort">{{ $t('globalDefaults.sortOrder') }}</label>
              <input id="bt-sort" v-model.number="form.sort_order" type="number" min="0" class="form-input" />
            </div>
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
          <div v-for="bt in items" :key="bt.id" class="card defaults-card" :class="{ inactive: !bt.is_active }">
            <div class="defaults-header">
              <div>
                <span class="defaults-name">{{ bt.name }}</span>
                <span class="defaults-sub mono">{{ bt.code }}</span>
              </div>
              <span class="badge" :class="bt.is_active ? 'badge-active' : 'badge-inactive'">
                {{ bt.is_active ? $t('common.active') : $t('common.inactive') }}
              </span>
            </div>

            <div class="breed-stats">
              <span class="stat-pill">{{ $t('breedTypes.gestationDays') }}: <strong class="mono">{{ bt.gestation_days }}</strong></span>
              <span class="stat-pill">{{ $t('breedTypes.heatCycleDays') }}: <strong class="mono">{{ bt.heat_cycle_days }}</strong></span>
              <span class="stat-pill">{{ $t('breedTypes.dryOffDays') }}: <strong class="mono">{{ bt.dry_off_days }}</strong></span>
            </div>

            <div class="defaults-actions">
              <button class="btn-secondary btn-sm" @click="openEdit(bt)">{{ $t('common.edit') }}</button>
              <button v-if="bt.is_active" class="btn-danger btn-sm" @click="confirmDeactivate(bt)">{{ $t('common.deactivate') }}</button>
              <template v-else>
                <button class="btn-primary btn-sm" :disabled="activating === bt.id" @click="doActivate(bt)">{{ $t('common.activate') }}</button>
                <button class="btn-danger btn-sm" @click="confirmDelete(bt)">{{ $t('common.delete') }}</button>
              </template>
            </div>
          </div>
        </div>
      </template>
    </div>

    <button v-if="!showForm" class="fab" :title="$t('common.add')" @click="openAdd">+</button>

    <ConfirmDialog
      :show="!!deactivateTarget"
      :message="deactivateTarget ? $t('globalDefaults.deactivateConfirm', { name: deactivateTarget.name }) : ''"
      :confirm-label="$t('common.deactivate')"
      :cancel-label="$t('common.cancel')"
      :loading="deactivating"
      @confirm="doDeactivate"
      @cancel="deactivateTarget = null"
    />

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
  name: '', gestation_days: 283, heat_cycle_days: 21, preg_check_days: 35,
  dry_off_days: 60, voluntary_waiting_days: 50, sort_order: 0,
})
const form = ref(emptyForm())

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/global-defaults/breed-types?all=1')
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

function openEdit(bt) {
  editing.value = bt
  form.value = {
    name: bt.name,
    gestation_days: bt.gestation_days,
    heat_cycle_days: bt.heat_cycle_days,
    preg_check_days: bt.preg_check_days,
    dry_off_days: bt.dry_off_days,
    voluntary_waiting_days: bt.voluntary_waiting_days,
    sort_order: bt.sort_order ?? 0,
  }
  formError.value = ''
  showForm.value = true
}

async function save() {
  saving.value = true
  formError.value = ''
  try {
    const payload = { ...form.value }
    if (editing.value) {
      await api.patch(`/global-defaults/breed-types/${editing.value.id}`, payload)
    } else {
      await api.post('/global-defaults/breed-types', payload)
    }
    showForm.value = false
    await load()
  } catch (err) {
    formError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

function confirmDeactivate(bt) { deactivateTarget.value = bt }

async function doActivate(bt) {
  activating.value = bt.id
  try {
    await api.patch(`/global-defaults/breed-types/${bt.id}`, { is_active: true })
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
    await api.delete(`/global-defaults/breed-types/${deactivateTarget.value.id}`)
    deactivateTarget.value = null
    await load()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deactivating.value = false
  }
}

function confirmDelete(bt) { deleteTarget.value = bt }

async function doDelete() {
  deleting.value = true
  try {
    await api.delete(`/global-defaults/breed-types/${deleteTarget.value.id}?hard=1`)
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
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; }
.form-actions .btn-primary, .form-actions .btn-secondary { width: auto; padding: 10px 20px; }
.spinner-wrap { display: flex; justify-content: center; padding: 40px; }
.defaults-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.defaults-card { padding: 16px; display: flex; flex-direction: column; }
.defaults-card.inactive { opacity: 0.6; }
.defaults-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.defaults-name { font-weight: 600; font-size: 1rem; display: block; }
.defaults-sub { font-size: 0.8rem; color: var(--text-muted); display: block; margin-top: 2px; }
.breed-stats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; font-size: 0.8rem; color: var(--text-secondary); }
.stat-pill { background: var(--bg); padding: 3px 8px; border-radius: var(--radius-sm); }
.defaults-actions { display: flex; gap: 8px; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border); }
.badge-active { background: var(--success-light); color: var(--primary-dark); }
.badge-inactive { background: var(--border); color: var(--text-secondary); }
</style>
