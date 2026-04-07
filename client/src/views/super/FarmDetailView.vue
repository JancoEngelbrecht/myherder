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
            <span
              >{{ t('superAdmin.created') }}:
              {{ new Date(farm.created_at).toLocaleDateString() }}</span
            >
            <span v-if="farm.species" class="detail-species">
              {{ farm.species.code === 'sheep' ? '🐑' : '🐄' }} {{ farm.species.name }}
            </span>
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
            <button v-else class="btn-secondary btn-sm-pill" @click="reactivate">
              {{ t('superAdmin.reactivateFarm') }}
            </button>
            <button class="btn-danger btn-sm-pill" @click="showDeleteFarm = true">
              {{ t('superAdmin.deleteFarm') }}
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
            <h3 class="section-title">
              {{ t('superAdmin.users') }} ({{ farm.users?.length || 0 }})
            </h3>
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

        <!-- Feature Flags Section -->
        <div class="card flags-card">
          <h3 class="section-title">{{ t('featureFlags.sectionTitle') }}</h3>
          <p class="flags-desc">{{ t('featureFlags.sectionDesc') }}</p>

          <div class="flags-list">
            <label
              v-for="flag in flagList"
              :key="`${flag.key}-${flagsKey}`"
              class="flag-row"
              :class="{ 'flag-disabled': togglingFlags.has(flag.key) }"
            >
              <div class="flag-info">
                <span class="flag-name">{{ t(`featureFlags.${flag.key}.name`) }}</span>
                <span class="flag-desc">{{ t(`featureFlags.${flag.key}.desc`) }}</span>
              </div>
              <input
                type="checkbox"
                class="toggle"
                :checked="farmFlags[flag.key]"
                :disabled="togglingFlags.has(flag.key)"
                @change="toggleFlag(flag.key, $event.target.checked)"
              />
            </label>
          </div>
        </div> </template
      ><!-- end farm loaded -->

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

      <!-- Pending Sync Enter Farm Dialog -->
      <ConfirmDialog
        :show="pendingSyncWarning"
        :message="t('sync.pendingSwitchWarning', { count: pendingSyncCount })"
        :confirm-label="t('sync.switchAnyway')"
        :cancel-label="t('common.cancel')"
        :loading="enteringFarm"
        @confirm="confirmPendingEnter"
        @cancel="cancelPendingEnter"
      />

      <!-- Hard Delete Farm Dialog (typed confirmation) -->
      <Transition name="fade">
        <div
          v-if="showDeleteFarm"
          ref="deleteDialogOverlay"
          class="dialog-overlay"
          tabindex="-1"
          @click.self="cancelDelete"
          @keydown.escape="cancelDelete"
        >
          <div class="dialog" role="dialog" aria-modal="true">
            <p class="dialog-text">
              {{ t('superAdmin.deleteConfirmMessage', { name: farm?.name }) }}
            </p>
            <div class="form-group">
              <label>{{ t('superAdmin.typeToConfirm', { name: farm?.name }) }}</label>
              <input v-model="deleteConfirmInput" class="form-input" :placeholder="farm?.name" />
            </div>
            <div class="dialog-actions">
              <button
                class="btn-danger"
                :disabled="deleting || deleteConfirmInput !== farm?.name"
                @click="hardDeleteFarm"
              >
                {{ t('superAdmin.deleteFarmConfirm') }}
              </button>
              <button class="btn-secondary" :disabled="deleting" @click="cancelDelete">
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import api from '../../services/api'
import AppHeader from '../../components/organisms/AppHeader.vue'
import ConfirmDialog from '../../components/molecules/ConfirmDialog.vue'
import { useToast } from '../../composables/useToast'
import { extractApiError, resolveError } from '../../utils/apiError'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { showToast } = useToast()

const farm = ref(null)
const loading = ref(true)
const farmFlags = ref({})
const togglingFlags = ref(new Set())
const flagsKey = ref(0)

const flagList = [
  { key: 'breeding' },
  { key: 'milkRecording' },
  { key: 'healthIssues' },
  { key: 'treatments' },
  { key: 'analytics' },
]

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

const showDeleteFarm = ref(false)
const deleteConfirmInput = ref('')
const deleting = ref(false)
const deleteDialogOverlay = ref(null)

const enteringFarm = ref(false)
const pendingSyncWarning = ref(false)
const pendingSyncCount = ref(0)

watch(showDeleteFarm, async (visible) => {
  if (visible) {
    await nextTick()
    deleteDialogOverlay.value?.focus()
  }
})

async function fetchFarm() {
  try {
    const { data } = await api.get(`/farms/${route.params.id}`)
    farm.value = data
    farmFlags.value = data.feature_flags || {}
    editForm.value = { name: data.name, code: data.code }
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    loading.value = false
  }
}

async function toggleFlag(key, enabled) {
  if (togglingFlags.value.has(key)) return
  const prev = farmFlags.value[key]
  farmFlags.value = { ...farmFlags.value, [key]: enabled }
  togglingFlags.value.add(key)
  try {
    const { data } = await api.patch(`/farms/${farm.value.id}/feature-flags`, { [key]: enabled })
    farmFlags.value = data
  } catch (err) {
    farmFlags.value = { ...farmFlags.value, [key]: prev }
    flagsKey.value++
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    togglingFlags.value.delete(key)
  }
}

onMounted(fetchFarm)

async function handleEnter({ force = false } = {}) {
  enteringFarm.value = true
  try {
    await authStore.enterFarm(farm.value.id, { force })
    router.push('/')
  } catch (err) {
    if (err.message === 'PENDING_SYNC') {
      pendingSyncCount.value = err.pendingCount
      pendingSyncWarning.value = true
    } else {
      showToast(resolveError(extractApiError(err), t), 'error')
    }
  } finally {
    enteringFarm.value = false
  }
}

function cancelPendingEnter() {
  pendingSyncWarning.value = false
}

async function confirmPendingEnter() {
  try {
    await handleEnter({ force: true })
  } finally {
    pendingSyncWarning.value = false
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
    editError.value = resolveError(extractApiError(err), t)
  } finally {
    editSaving.value = false
  }
}

async function deactivate() {
  deactivating.value = true
  try {
    const { data } = await api.patch(`/farms/${farm.value.id}`, { is_active: false })
    farm.value = { ...farm.value, ...data }
    showDeactivate.value = false
    showToast(t('superAdmin.farmDeactivated'), 'success')
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deactivating.value = false
  }
}

function cancelDelete() {
  showDeleteFarm.value = false
  deleteConfirmInput.value = ''
}

async function hardDeleteFarm() {
  deleting.value = true
  try {
    await api.delete(`/farms/${farm.value.id}`)
    showToast(t('superAdmin.farmDeleted'), 'success')
    router.push('/super/farms')
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deleting.value = false
  }
}

async function reactivate() {
  try {
    const { data } = await api.patch(`/farms/${farm.value.id}`, { is_active: true })
    farm.value = { ...farm.value, ...data }
    showToast(t('superAdmin.farmUpdated'), 'success')
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  }
}

async function revokeUserSessions() {
  revokingUser.value = true
  try {
    await api.post(`/users/${revokeTarget.value.id}/revoke-sessions`)
    showToast(t('users.sessionsRevoked', { name: revokeTarget.value.full_name }), 'success')
    revokeTarget.value = null
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
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
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
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
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.detail-species {
  font-weight: 600;
  color: var(--text);
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

.flags-card {
  padding: 16px;
  margin-top: 16px;
}

.flags-desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 4px 0 12px;
}

.flags-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.flag-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.flag-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.flag-info {
  display: flex;
  flex-direction: column;
}

.flag-name {
  font-weight: 600;
  font-size: 0.875rem;
}

.flag-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.toggle {
  width: 44px;
  height: 24px;
  appearance: none;
  background: var(--border);
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}

.toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle:checked {
  background: var(--primary);
}

.toggle:checked::after {
  transform: translateX(20px);
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  padding: 24px;
}

.dialog {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 360px;
  box-shadow: var(--shadow-lg);
}

.dialog-text {
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  margin-bottom: 20px;
}

.dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
