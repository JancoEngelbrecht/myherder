<template>
  <div class="page">
    <AppHeader :title="farm?.name || t('superAdmin.farmDetail')" show-back back-to="/super/farms" />

    <div class="page-content">
      <div v-if="loading" class="empty-state"><span class="spinner" /></div>

      <template v-else-if="farm">
        <!-- Farm Info Card -->
        <div class="card detail-card">
          <div class="detail-header">
            <div>
              <h2 class="detail-name">{{ farm.name }}</h2>
              <span class="mono detail-code">{{ farm.code }}</span>
            </div>
            <span :class="['badge', farm.is_active ? 'badge-active' : 'badge-inactive']">
              {{ farm.is_active ? t('superAdmin.active') : t('superAdmin.inactive') }}
            </span>
          </div>

          <div class="detail-meta">
            <span>{{ t('superAdmin.created') }}: {{ new Date(farm.created_at).toLocaleDateString() }}</span>
          </div>

          <div class="detail-actions">
            <button class="btn-primary btn-sm-pill" @click="handleEnter">
              {{ t('superAdmin.enterFarm') }}
            </button>
            <button v-if="!editMode" class="btn-secondary btn-sm-pill" @click="editMode = true">
              {{ t('common.edit') }}
            </button>
            <button
              v-if="farm.is_active"
              class="btn-danger btn-sm-pill"
              @click="showDeactivate = true"
            >
              {{ t('superAdmin.deactivateFarm') }}
            </button>
            <button
              v-else
              class="btn-secondary btn-sm-pill"
              @click="reactivate"
            >
              {{ t('superAdmin.reactivateFarm') }}
            </button>
          </div>
        </div>

        <!-- Edit Form -->
        <div v-if="editMode" class="card edit-card">
          <h3 class="form-title">{{ t('common.edit') }}</h3>
          <form @submit.prevent="saveEdit">
            <div class="form-group">
              <label for="fd-name">{{ t('superAdmin.farmName') }}</label>
              <input id="fd-name" v-model="editForm.name" class="form-input" maxlength="100" />
            </div>
            <div class="form-group">
              <label for="fd-code">{{ t('superAdmin.farmCode') }}</label>
              <input
                id="fd-code"
                v-model="editForm.code"
                class="form-input mono"
                maxlength="10"
                @input="editForm.code = editForm.code.toUpperCase().replace(/[^A-Z0-9]/g, '')"
              />
            </div>
            <div class="edit-buttons">
              <button type="submit" class="btn-primary btn-sm-pill" :disabled="editSaving">
                {{ editSaving ? t('common.saving') : t('common.save') }}
              </button>
              <button type="button" class="btn-secondary btn-sm-pill" @click="editMode = false">
                {{ t('common.cancel') }}
              </button>
            </div>
            <p v-if="editError" class="error-text">{{ editError }}</p>
          </form>
        </div>

        <!-- Users Section -->
        <div class="card users-card">
          <div class="users-header">
            <h3 class="section-title">{{ t('superAdmin.users') }} ({{ farm.users?.length || 0 }})</h3>
            <button class="btn-danger btn-sm-pill" @click="showRevokeAll = true">
              {{ t('superAdmin.revokeAllSessions') }}
            </button>
          </div>

          <div v-if="!farm.users?.length" class="empty-state">
            <p>{{ t('superAdmin.noUsers') }}</p>
          </div>

          <div v-else class="user-list">
            <div v-for="u in farm.users" :key="u.id" class="user-row">
              <div class="user-info">
                <span class="user-name">{{ u.full_name }}</span>
                <span class="user-meta">@{{ u.username }} &middot; {{ u.role }}</span>
              </div>
              <div class="user-actions">
                <button
                  v-if="u.is_active"
                  class="btn-secondary btn-sm-pill btn-revoke"
                  @click="revokeTarget = u"
                >
                  {{ t('users.revokeSessions') }}
                </button>
                <span :class="['badge', u.is_active ? 'badge-active' : 'badge-inactive']">
                  {{ u.is_active ? t('superAdmin.active') : t('superAdmin.inactive') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Deactivate Confirm Dialog -->
      <ConfirmDialog
        :show="showDeactivate"
        :message="t('superAdmin.deactivateConfirm')"
        :confirm-label="t('superAdmin.deactivateFarm')"
        :cancel-label="t('common.cancel')"
        :loading="deactivating"
        @confirm="deactivate"
        @cancel="showDeactivate = false"
      />

      <!-- Revoke All Sessions Dialog -->
      <ConfirmDialog
        :show="showRevokeAll"
        :message="t('superAdmin.revokeAllConfirm')"
        :confirm-label="t('superAdmin.revokeAllSessions')"
        :cancel-label="t('common.cancel')"
        :loading="revoking"
        @confirm="revokeAllSessions"
        @cancel="showRevokeAll = false"
      />

      <!-- Revoke Single User Sessions Dialog -->
      <ConfirmDialog
        :show="!!revokeTarget"
        :message="t('users.revokeSessionsConfirm', { name: revokeTarget?.full_name })"
        :confirm-label="t('users.revokeSessions')"
        :cancel-label="t('common.cancel')"
        :loading="revokingUser"
        @confirm="revokeUserSessions"
        @cancel="revokeTarget = null"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import api from '../../services/api.js'
import AppHeader from '../../components/organisms/AppHeader.vue'
import ConfirmDialog from '../../components/molecules/ConfirmDialog.vue'
import { useToast } from '../../composables/useToast.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { showToast } = useToast()

const farm = ref(null)
const loading = ref(true)

const editMode = ref(false)
const editForm = ref({ name: '', code: '' })
const editSaving = ref(false)
const editError = ref('')

const showDeactivate = ref(false)
const deactivating = ref(false)

const showRevokeAll = ref(false)
const revoking = ref(false)

const revokeTarget = ref(null)
const revokingUser = ref(false)

async function fetchFarm() {
  try {
    const { data } = await api.get(`/farms/${route.params.id}`)
    farm.value = data
    editForm.value = { name: data.name, code: data.code }
  } catch {
    showToast(t('common.error'), 'error')
  } finally {
    loading.value = false
  }
}

onMounted(fetchFarm)

async function handleEnter() {
  try {
    await authStore.enterFarm(farm.value.id)
    router.push('/')
  } catch {
    showToast(t('common.error'), 'error')
  }
}

async function saveEdit() {
  editSaving.value = true
  editError.value = ''
  try {
    const { data } = await api.patch(`/farms/${farm.value.id}`, editForm.value)
    farm.value = { ...farm.value, ...data }
    editMode.value = false
    showToast(t('superAdmin.farmUpdated'), 'success')
  } catch (err) {
    editError.value = err.response?.data?.error || t('common.error')
  } finally {
    editSaving.value = false
  }
}

async function deactivate() {
  deactivating.value = true
  try {
    await api.delete(`/farms/${farm.value.id}`)
    farm.value.is_active = false
    showDeactivate.value = false
    showToast(t('superAdmin.farmDeactivated'), 'success')
  } catch {
    showToast(t('common.error'), 'error')
  } finally {
    deactivating.value = false
  }
}

async function reactivate() {
  try {
    const { data } = await api.patch(`/farms/${farm.value.id}`, { is_active: true })
    farm.value = { ...farm.value, ...data }
    showToast(t('superAdmin.farmUpdated'), 'success')
  } catch {
    showToast(t('common.error'), 'error')
  }
}

async function revokeUserSessions() {
  revokingUser.value = true
  try {
    await api.post(`/users/${revokeTarget.value.id}/revoke-sessions`)
    showToast(t('users.sessionsRevoked', { name: revokeTarget.value.full_name }), 'success')
    revokeTarget.value = null
  } catch {
    showToast(t('common.error'), 'error')
  } finally {
    revokingUser.value = false
  }
}

async function revokeAllSessions() {
  revoking.value = true
  try {
    await api.post(`/farms/${farm.value.id}/revoke-all-sessions`)
    showRevokeAll.value = false
    showToast(t('superAdmin.sessionsRevoked'), 'success')
  } catch {
    showToast(t('common.error'), 'error')
  } finally {
    revoking.value = false
  }
}
</script>

<style scoped>
.detail-card {
  padding: 16px;
  margin-bottom: 16px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.detail-name {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0 0 4px;
}

.detail-code {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.detail-meta {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-actions button {
  width: auto;
}

.edit-card {
  padding: 16px;
  margin-bottom: 16px;
}

.form-title {
  font-size: 0.9375rem;
  font-weight: 700;
  margin: 0 0 12px;
}

.edit-buttons {
  display: flex;
  gap: 8px;
}

.edit-buttons button {
  width: auto;
}

.error-text {
  color: var(--danger);
  font-size: 0.8125rem;
  margin-top: 8px;
}

.users-card {
  padding: 16px;
}

.users-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.users-header button {
  width: auto;
}

.section-title {
  font-size: 0.9375rem;
  font-weight: 700;
  margin: 0;
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.user-row:last-child {
  border-bottom: none;
}

.user-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-revoke {
  font-size: 0.75rem;
  padding: 4px 8px;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-weight: 600;
  font-size: 0.875rem;
}

.user-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.badge-active {
  background: var(--success-light);
  color: var(--primary-dark);
}

.badge-inactive {
  background: var(--danger-light);
  color: var(--danger);
}
</style>
