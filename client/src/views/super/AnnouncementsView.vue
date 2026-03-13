<template>
  <div class="page">
    <AppHeader :title="$t('announcements.title')" show-back back-to="/" />

    <div class="page-content ann-content">
      <!-- Add / Edit Form -->
      <div v-if="showForm" class="card form-card">
        <h3 class="form-title">{{ editing ? $t('announcements.edit') : $t('announcements.create') }}</h3>
        <form @submit.prevent="save">
          <div class="form-group">
            <label for="ann-title">{{ $t('announcements.announcementTitle') }} *</label>
            <input id="ann-title" v-model="form.title" class="form-input" required />
          </div>

          <div class="form-group">
            <label for="ann-message">{{ $t('announcements.message') }}</label>
            <textarea id="ann-message" v-model="form.message" class="form-input" rows="3" />
          </div>

          <div class="form-group">
            <label>{{ $t('announcements.severity') }}</label>
            <div class="chip-row">
              <button
                v-for="s in severities"
                :key="s"
                type="button"
                class="chip"
                :class="{ active: form.type === s, [`chip-${s}`]: true }"
                @click="form.type = s"
              >{{ $t(`announcements.${s}`) }}</button>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="ann-starts">{{ $t('announcements.startsAt') }}</label>
              <input id="ann-starts" v-model="form.starts_at" type="datetime-local" class="form-input" />
            </div>
            <div class="form-group">
              <label for="ann-expires">{{ $t('announcements.expiresAt') }}</label>
              <input id="ann-expires" v-model="form.expires_at" type="datetime-local" class="form-input" />
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
          <p>{{ $t('announcements.noAnnouncements') }}</p>
        </div>

        <div v-else class="ann-list">
          <div v-for="ann in items" :key="ann.id" class="card ann-card" :class="{ inactive: !ann.is_active }">
            <div class="ann-header">
              <div>
                <span class="ann-type-badge" :class="`type-${ann.type}`">{{ $t(`announcements.${ann.type}`) }}</span>
                <span class="ann-title-text">{{ ann.title }}</span>
              </div>
              <span class="badge" :class="statusClass(ann)">{{ statusLabel(ann) }}</span>
            </div>

            <p v-if="ann.message" class="ann-message">{{ ann.message }}</p>

            <div class="ann-meta">
              <span v-if="ann.starts_at">{{ $t('announcements.startsAt') }}: {{ formatDate(ann.starts_at) }}</span>
              <span v-if="ann.expires_at">{{ $t('announcements.expiresAt') }}: {{ formatDate(ann.expires_at) }}</span>
            </div>

            <div class="defaults-actions">
              <button class="btn-secondary btn-sm" @click="openEdit(ann)">{{ $t('common.edit') }}</button>
              <button v-if="ann.is_active && !canDelete(ann)" class="btn-danger btn-sm" @click="confirmDeactivate(ann)">{{ $t('announcements.deactivate') }}</button>
              <button v-if="canDelete(ann)" class="btn-danger btn-sm" @click="confirmDelete(ann)">{{ $t('common.delete') }}</button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <button v-if="!showForm" class="fab" :title="t('announcements.create')" @click="openAdd">+</button>

    <ConfirmDialog
      :show="!!deactivateTarget"
      :message="$t('announcements.deactivateConfirm')"
      :confirm-label="$t('announcements.deactivate')"
      :cancel-label="$t('common.cancel')"
      :loading="deactivating"
      @confirm="doDeactivate"
      @cancel="deactivateTarget = null"
    />

    <ConfirmDialog
      :show="!!deleteTarget"
      :message="$t('announcements.deleteConfirm')"
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

const { showToast } = useToast()

const { t } = useI18n()

const severities = ['info', 'warning', 'maintenance']
const items = ref([])
const loading = ref(true)
const showForm = ref(false)
const editing = ref(null)
const saving = ref(false)
const formError = ref('')
const deactivateTarget = ref(null)
const deactivating = ref(false)
const deleteTarget = ref(null)
const deleting = ref(false)

const emptyForm = () => ({ title: '', message: '', type: 'info', starts_at: '', expires_at: '' })
const form = ref(emptyForm())

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/announcements')
    items.value = data
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusClass(ann) {
  if (!ann.is_active) return 'badge-inactive'
  if (ann.expires_at && new Date(ann.expires_at) < new Date()) return 'badge-expired'
  if (ann.starts_at && new Date(ann.starts_at) > new Date()) return 'badge-scheduled'
  return 'badge-active'
}

function statusLabel(ann) {
  if (!ann.is_active) return t('common.inactive')
  if (ann.expires_at && new Date(ann.expires_at) < new Date()) return t('announcements.expired')
  if (ann.starts_at && new Date(ann.starts_at) > new Date()) return t('announcements.scheduled')
  return t('announcements.active')
}

function canDelete(ann) {
  if (!ann.is_active) return true
  if (ann.expires_at && new Date(ann.expires_at) < new Date()) return true
  return false
}

function toLocalInput(iso) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

function toISOOrNull(val) {
  if (!val) return null
  return new Date(val).toISOString()
}

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  formError.value = ''
  showForm.value = true
}

function openEdit(ann) {
  editing.value = ann
  form.value = {
    title: ann.title,
    message: ann.message || '',
    type: ann.type,
    starts_at: toLocalInput(ann.starts_at),
    expires_at: toLocalInput(ann.expires_at),
  }
  formError.value = ''
  showForm.value = true
}

async function save() {
  saving.value = true
  formError.value = ''
  try {
    const payload = {
      title: form.value.title,
      message: form.value.message || null,
      type: form.value.type,
      starts_at: toISOOrNull(form.value.starts_at),
      expires_at: toISOOrNull(form.value.expires_at),
    }
    if (editing.value) {
      await api.patch(`/announcements/${editing.value.id}`, payload)
      showToast(t('announcements.updated'), 'success')
    } else {
      await api.post('/announcements', payload)
      showToast(t('announcements.created'), 'success')
    }
    showForm.value = false
    await load()
  } catch (err) {
    formError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

function confirmDeactivate(ann) { deactivateTarget.value = ann }

async function doDeactivate() {
  deactivating.value = true
  try {
    await api.delete(`/announcements/${deactivateTarget.value.id}`)
    showToast(t('announcements.deactivated'), 'success')
    await load()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deactivateTarget.value = null
    deactivating.value = false
  }
}

function confirmDelete(ann) { deleteTarget.value = ann }

async function doDelete() {
  deleting.value = true
  try {
    await api.post(`/announcements/${deleteTarget.value.id}/permanent`)
    showToast(t('announcements.deleted'), 'success')
    await load()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deleteTarget.value = null
    deleting.value = false
  }
}
</script>

<style scoped>
.ann-content { padding-bottom: 100px; }
.form-card { margin: 0 auto 20px; padding: 20px; max-width: 600px; }
.form-title { margin: 0 0 16px; font-size: 1rem; font-weight: 600; }
.form-row { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 480px) { .form-row { grid-template-columns: 1fr 1fr; } }
.chip-row { display: flex; gap: 8px; }
.chip { padding: 8px 16px; border-radius: var(--radius-full); border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-size: 0.85rem; }
.chip.active { color: white; border-color: transparent; }
.chip-info.active { background: #2563EB; }
.chip-warning.active { background: #D97706; }
.chip-maintenance.active { background: #DC2626; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; }
.form-actions .btn-primary, .form-actions .btn-secondary { width: auto; padding: 10px 20px; }
.spinner-wrap { display: flex; justify-content: center; padding: 40px; }
.ann-list { display: flex; flex-direction: column; gap: 12px; }
.ann-card { padding: 16px; }
.ann-card.inactive { opacity: 0.6; }
.ann-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.ann-type-badge { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: var(--radius-full); margin-right: 8px; }
.type-info { background: #DBEAFE; color: #1E40AF; }
.type-warning { background: #FEF3C7; color: #92400E; }
.type-maintenance { background: #FEE2E2; color: #991B1B; }
.ann-title-text { font-weight: 600; }
.ann-message { font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 8px; }
.ann-meta { display: flex; gap: 16px; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px; }
.defaults-actions { display: flex; gap: 8px; }
.badge-active { background: var(--success-light); color: var(--primary-dark); }
.badge-inactive { background: var(--border); color: var(--text-secondary); }
.badge-expired { background: var(--danger-light); color: var(--danger); }
.badge-scheduled { background: #DBEAFE; color: #1E40AF; }
</style>
