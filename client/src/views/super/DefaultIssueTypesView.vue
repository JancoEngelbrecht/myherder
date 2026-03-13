<template>
  <div class="page">
    <AppHeader :title="$t('globalDefaults.issueTypes')" show-back back-to="/super/defaults" />

    <div class="page-content defaults-content">
      <!-- Add / Edit Form -->
      <div v-if="showForm" class="card form-card">
        <h3 class="form-title">{{ editing ? $t('common.edit') : $t('common.add') }}</h3>
        <form @submit.prevent="save">
          <div class="form-group">
            <label for="it-name">{{ $t('issueTypes.name') }} *</label>
            <input id="it-name" v-model="form.name" class="form-input" required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="it-emoji">{{ $t('issueTypes.emoji') }}</label>
              <input id="it-emoji" v-model="form.emoji" class="form-input" maxlength="4" />
            </div>
            <div class="form-group">
              <label for="it-sort">{{ $t('globalDefaults.sortOrder') }}</label>
              <input id="it-sort" v-model.number="form.sort_order" type="number" min="0" class="form-input" />
            </div>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="form.requires_teat_selection" type="checkbox" />
              {{ $t('issueTypes.requiresTeat') }}
            </label>
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
          <div v-for="it in items" :key="it.id" class="card defaults-card" :class="{ inactive: !it.is_active }">
            <div class="defaults-header">
              <div>
                <span class="defaults-name">{{ it.emoji }} {{ it.name }}</span>
                <span class="defaults-sub mono">{{ it.code }}</span>
              </div>
              <span class="badge" :class="it.is_active ? 'badge-active' : 'badge-inactive'">
                {{ it.is_active ? $t('common.active') : $t('common.inactive') }}
              </span>
            </div>

            <div v-if="it.requires_teat_selection" class="detail-pill">{{ $t('issueTypes.requiresTeat') }}</div>

            <div class="defaults-actions">
              <button class="btn-secondary btn-sm" @click="openEdit(it)">{{ $t('common.edit') }}</button>
              <button v-if="it.is_active" class="btn-danger btn-sm" @click="confirmDeactivate(it)">{{ $t('common.deactivate') }}</button>
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

const emptyForm = () => ({ name: '', emoji: '', requires_teat_selection: false, sort_order: 0 })
const form = ref(emptyForm())

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/global-defaults/issue-types?all=1')
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

function openEdit(it) {
  editing.value = it
  form.value = { name: it.name, emoji: it.emoji || '', requires_teat_selection: !!it.requires_teat_selection, sort_order: it.sort_order ?? 0 }
  formError.value = ''
  showForm.value = true
}

async function save() {
  saving.value = true
  formError.value = ''
  try {
    const payload = {
      name: form.value.name,
      emoji: form.value.emoji || null,
      requires_teat_selection: form.value.requires_teat_selection,
      sort_order: form.value.sort_order,
    }
    if (editing.value) {
      await api.patch(`/global-defaults/issue-types/${editing.value.id}`, payload)
    } else {
      await api.post('/global-defaults/issue-types', payload)
    }
    showForm.value = false
    await load()
  } catch (err) {
    formError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

function confirmDeactivate(it) { deactivateTarget.value = it }

async function doDeactivate() {
  deactivating.value = true
  try {
    await api.delete(`/global-defaults/issue-types/${deactivateTarget.value.id}`)
    deactivateTarget.value = null
    await load()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deactivating.value = false
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
.checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.spinner-wrap { display: flex; justify-content: center; padding: 40px; }
.defaults-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.defaults-card { padding: 16px; display: flex; flex-direction: column; }
.defaults-card.inactive { opacity: 0.6; }
.defaults-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.defaults-name { font-weight: 600; font-size: 1rem; display: block; }
.defaults-sub { font-size: 0.8rem; color: var(--text-muted); display: block; margin-top: 2px; }
.detail-pill { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px; }
.defaults-actions { display: flex; gap: 8px; margin-top: auto; }
.badge-active { background: var(--success-light); color: var(--primary-dark); }
.badge-inactive { background: var(--border); color: var(--text-secondary); }
</style>
