<template>
  <div class="page">
    <AppHeader :title="t('users.title')" show-back back-to="/settings" />

    <div class="page-content um-content">
      <!-- Add / Edit form -->
      <div v-if="formMode" class="card form-card">
        <h3 class="form-title">
          {{ formMode === 'add' ? t('users.addUser') : t('users.editUser') }}
        </h3>
        <form @submit.prevent="save">
          <div class="form-group">
            <label for="um-username">{{ t('users.username') }} *</label>
            <input
              id="um-username"
              v-model="form.username"
              class="form-input"
              required
              maxlength="50"
              :placeholder="t('users.usernamePlaceholder')"
            />
          </div>

          <div class="form-group">
            <label for="um-fullname">{{ t('users.fullName') }} *</label>
            <input
              id="um-fullname"
              v-model="form.full_name"
              class="form-input"
              required
              maxlength="100"
              :placeholder="t('users.fullNamePlaceholder')"
            />
          </div>

          <div class="form-group">
            <label>{{ t('users.role') }} *</label>
            <div class="role-row">
              <label class="radio-label">
                <input v-model="form.role" type="radio" value="admin" :disabled="isEditingSelf" />
                {{ t('users.roleAdmin') }}
              </label>
              <label class="radio-label">
                <input v-model="form.role" type="radio" value="worker" :disabled="isEditingSelf" />
                {{ t('users.roleWorker') }}
              </label>
            </div>
            <p v-if="isEditingSelf" class="hint-text">{{ t('users.selfRoleBlocked') }}</p>
          </div>

          <div class="form-group">
            <label for="um-language">{{ t('users.language') }}</label>
            <select id="um-language" v-model="form.language" class="form-input">
              <option value="en">English</option>
              <option value="af">Afrikaans</option>
            </select>
          </div>

          <!-- Password (admin) or PIN (worker) -->
          <div v-if="form.role === 'admin'" class="form-group">
            <label for="um-password">
              {{ formMode === 'edit' ? t('users.newPassword') : t('users.password') }}
              {{ formMode === 'add' ? '*' : '' }}
            </label>
            <input
              id="um-password"
              v-model="form.password"
              type="password"
              class="form-input"
              :required="formMode === 'add'"
              minlength="6"
              maxlength="128"
              :placeholder="t('users.passwordPlaceholder')"
            />
            <p v-if="formMode === 'edit'" class="hint-text">
              {{ t('users.changeCredentialHint') }}
            </p>
          </div>

          <div v-if="form.role === 'worker'" class="form-group">
            <label for="um-pin">
              {{ formMode === 'edit' ? t('users.newPin') : t('users.pin') }}
              {{ formMode === 'add' ? '*' : '' }}
            </label>
            <input
              id="um-pin"
              v-model="form.pin"
              type="text"
              inputmode="numeric"
              pattern="\d{4}"
              class="form-input"
              :required="formMode === 'add'"
              maxlength="4"
              :placeholder="t('users.pinPlaceholder')"
            />
            <p v-if="formMode === 'edit'" class="hint-text">
              {{ t('users.changeCredentialHint') }}
            </p>
          </div>

          <!-- Permissions -->
          <div class="form-group">
            <label>{{ t('users.permissions') }}</label>
            <p v-if="form.role === 'admin'" class="hint-text">
              {{ t('users.adminAutoPermissions') }}
            </p>
            <div class="perm-grid">
              <div class="perm-group">
                <span class="perm-group-label">{{ t('users.permissionGroups.logging') }}</span>
                <label v-for="p in permLogging" :key="p" class="perm-label">
                  <input
                    v-model="form.permissions"
                    type="checkbox"
                    :value="p"
                    :disabled="form.role === 'admin'"
                    :checked="form.role === 'admin' || form.permissions.includes(p)"
                  />
                  {{ t(`users.permissionLabels.${p}`) }}
                </label>
              </div>
              <div class="perm-group">
                <span class="perm-group-label">{{ t('users.permissionGroups.viewing') }}</span>
                <label v-for="p in permViewing" :key="p" class="perm-label">
                  <input
                    v-model="form.permissions"
                    type="checkbox"
                    :value="p"
                    :disabled="form.role === 'admin'"
                    :checked="form.role === 'admin' || form.permissions.includes(p)"
                  />
                  {{ t(`users.permissionLabels.${p}`) }}
                </label>
              </div>
              <div class="perm-group">
                <span class="perm-group-label">{{ t('users.permissionGroups.management') }}</span>
                <label v-for="p in permManagement" :key="p" class="perm-label">
                  <input
                    v-model="form.permissions"
                    type="checkbox"
                    :value="p"
                    :disabled="form.role === 'admin'"
                    :checked="form.role === 'admin' || form.permissions.includes(p)"
                  />
                  {{ t(`users.permissionLabels.${p}`) }}
                </label>
              </div>
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
      <div v-else-if="loading" class="spinner-wrap"><div class="spinner" /></div>

      <!-- List -->
      <template v-else>
        <div v-if="users.length === 0" class="empty-state">
          <p>{{ t('users.noUsers') }}</p>
        </div>

        <div v-else data-tour="um-list" class="user-list">
          <div
            v-for="user in users"
            :key="user.id"
            class="card user-card"
            :class="{ inactive: !user.is_active }"
          >
            <div class="user-header">
              <div class="user-info">
                <span class="user-name">{{ user.full_name }}</span>
                <span class="user-username mono">@{{ user.username }}</span>
              </div>
              <div data-tour="um-badges" class="user-badges">
                <span class="badge" :class="user.role === 'admin' ? 'badge-admin' : 'badge-worker'">
                  {{ user.role === 'admin' ? t('users.roleAdmin') : t('users.roleWorker') }}
                </span>
                <span class="badge" :class="user.is_active ? 'badge-active' : 'badge-inactive'">
                  {{ user.is_active ? t('users.active') : t('users.inactive') }}
                </span>
                <span class="badge badge-lang">{{ user.language.toUpperCase() }}</span>
              </div>
            </div>
            <div class="user-meta mono">
              {{
                t('users.permCount', {
                  count: Array.isArray(user.permissions) ? user.permissions.length : 0,
                })
              }}
            </div>
            <div class="user-actions">
              <button class="btn-secondary btn-sm" @click="openEdit(user)">
                {{ t('common.edit') }}
              </button>
              <button
                v-if="user.id !== currentUserId"
                class="btn-sm"
                :class="user.is_active ? 'btn-danger' : 'btn-primary'"
                @click="confirmToggleActive(user)"
              >
                {{ user.is_active ? t('users.deactivate') : t('users.reactivate') }}
              </button>
              <button
                v-if="user.id !== currentUserId && user.is_active"
                class="btn-sm btn-secondary"
                @click="confirmRevoke(user)"
              >
                {{ t('users.revokeSessions') }}
              </button>
              <button
                v-if="user.id !== currentUserId"
                class="btn-sm btn-danger-outline"
                @click="confirmPermanentDelete(user)"
              >
                {{ t('common.delete') }}
              </button>
            </div>
          </div>
        </div>

        <button data-tour="um-add" class="fab" :title="$t('users.addUser')" @click="openAdd">
          +
        </button>
      </template>
    </div>

    <TourButton above-fab @start-tour="startTour" />

    <ConfirmDialog
      :show="!!toggling"
      :message="toggleMessage"
      :confirm-label="toggling?.is_active ? t('users.deactivate') : t('users.reactivate')"
      :cancel-label="t('common.cancel')"
      :loading="toggleLoading"
      @confirm="executeToggle"
      @cancel="toggling = null"
    />

    <ConfirmDialog
      :show="!!deleting"
      :message="deleteMessage"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      :loading="deleteLoading"
      @confirm="executePermanentDelete"
      @cancel="deleting = null"
    />

    <ConfirmDialog
      :show="!!revoking"
      :message="revokeMessage"
      :confirm-label="t('users.revokeSessions')"
      :cancel-label="t('common.cancel')"
      :loading="revokeLoading"
      @confirm="executeRevoke"
      @cancel="revoking = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import TourButton from '../../components/atoms/TourButton.vue'
import ConfirmDialog from '../../components/molecules/ConfirmDialog.vue'
import { useAuthStore } from '../../stores/auth'
import api from '../../services/api'
import { extractApiError, resolveError } from '../../utils/apiError'
import { useToast } from '../../composables/useToast'
import { useTour } from '../../composables/useTour'

const { t } = useI18n()
const authStore = useAuthStore()
const toast = useToast()

const { startTour } = useTour(
  'user-management',
  () => [
    {
      element: '[data-tour="um-list"]',
      popover: {
        title: t('tour.userManagement.list.title'),
        description: t('tour.userManagement.list.desc'),
      },
    },
    {
      element: '[data-tour="um-badges"]',
      popover: {
        title: t('tour.userManagement.badges.title'),
        description: t('tour.userManagement.badges.desc'),
      },
    },
    {
      element: '[data-tour="um-add"]',
      popover: {
        title: t('tour.userManagement.add.title'),
        description: t('tour.userManagement.add.desc'),
      },
    },
  ],
  { autoStart: false }
)

const currentUserId = computed(() => authStore.user?.id)

const users = ref([])
const loading = ref(false)

const formMode = ref(null) // null | 'add' | 'edit'
const editingUser = ref(null)
const saving = ref(false)
const formError = ref('')

const toggling = ref(null)
const toggleMessage = ref('')
const toggleLoading = ref(false)

const deleting = ref(null)
const deleteMessage = ref('')
const deleteLoading = ref(false)

const revoking = ref(null)
const revokeMessage = ref('')
const revokeLoading = ref(false)

const permLogging = ['can_log_issues', 'can_log_treatments', 'can_log_breeding', 'can_record_milk']
const permViewing = ['can_view_analytics']
const permManagement = ['can_manage_animals', 'can_manage_medications']

const defaultForm = {
  username: '',
  full_name: '',
  role: 'worker',
  language: 'en',
  password: '',
  pin: '',
  permissions: [],
}

const form = ref({ ...defaultForm, permissions: [] })

const isEditingSelf = computed(
  () => formMode.value === 'edit' && editingUser.value?.id === currentUserId.value
)

onMounted(() => fetchUsers())

async function fetchUsers() {
  loading.value = true
  try {
    const { data } = await api.get('/users')
    users.value = data
  } catch {
    // error handled by api interceptor
  } finally {
    loading.value = false
  }
}

function openAdd() {
  formMode.value = 'add'
  editingUser.value = null
  form.value = { ...defaultForm, permissions: [] }
  formError.value = ''
}

function openEdit(user) {
  formMode.value = 'edit'
  editingUser.value = user
  form.value = {
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    language: user.language,
    password: '',
    pin: '',
    permissions: Array.isArray(user.permissions) ? [...user.permissions] : [],
  }
  formError.value = ''
}

function cancelForm() {
  formMode.value = null
  editingUser.value = null
}

async function save() {
  saving.value = true
  formError.value = ''
  try {
    const payload = {
      username: form.value.username,
      full_name: form.value.full_name,
      role: form.value.role,
      language: form.value.language,
      permissions: form.value.permissions,
    }

    // Add credential field based on role
    if (form.value.role === 'admin' && form.value.password) {
      payload.password = form.value.password
    }
    if (form.value.role === 'worker' && form.value.pin) {
      payload.pin = form.value.pin
    }

    if (formMode.value === 'add') {
      const { data } = await api.post('/users', payload)
      if (data.reactivated) {
        toast.show(t('users.userReactivated', { name: data.full_name }), 'success')
      }
    } else {
      // For edit, remove empty credential fields
      if (!payload.password) delete payload.password
      if (!payload.pin) delete payload.pin
      await api.patch(`/users/${editingUser.value.id}`, payload)
    }

    formMode.value = null
    editingUser.value = null
    await fetchUsers()
  } catch (err) {
    formError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

function confirmToggleActive(user) {
  toggling.value = user
  toggleMessage.value = user.is_active
    ? t('users.confirmDeactivate', { name: user.full_name })
    : t('users.confirmReactivate', { name: user.full_name })
}

function confirmPermanentDelete(user) {
  deleting.value = user
  deleteMessage.value = t('users.confirmDelete', { name: user.full_name })
}

async function executePermanentDelete() {
  deleteLoading.value = true
  try {
    await api.delete(`/users/${deleting.value.id}?permanent=true`)
    deleting.value = null
    await fetchUsers()
  } catch (err) {
    toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    deleteLoading.value = false
  }
}

function confirmRevoke(user) {
  revoking.value = user
  revokeMessage.value = t('users.revokeSessionsConfirm', { name: user.full_name })
}

async function executeRevoke() {
  revokeLoading.value = true
  try {
    await api.post(`/users/${revoking.value.id}/revoke-sessions`)
    toast.show(t('users.sessionsRevoked', { name: revoking.value.full_name }), 'success')
    revoking.value = null
    await fetchUsers()
  } catch (err) {
    toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    revokeLoading.value = false
  }
}

async function executeToggle() {
  toggleLoading.value = true
  try {
    if (toggling.value.is_active) {
      await api.delete(`/users/${toggling.value.id}`)
    } else {
      await api.patch(`/users/${toggling.value.id}`, { is_active: true })
    }
    toggling.value = null
    await fetchUsers()
  } catch (err) {
    toggling.value = null
    toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    toggleLoading.value = false
  }
}
</script>

<style scoped>
.um-content {
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

.role-row {
  display: flex;
  gap: 20px;
  margin-top: 4px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  cursor: pointer;
}

.hint-text {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin-top: 4px;
}

.perm-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.perm-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.perm-group-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.perm-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  cursor: pointer;
  padding: 2px 0;
}

.form-group {
  margin-bottom: 12px;
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

.user-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-card {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-card.inactive {
  opacity: 0.55;
}

.user-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 600;
  font-size: 0.95rem;
}

.user-username {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.user-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.badge-admin {
  background: var(--primary);
  color: white;
}

.badge-worker {
  background: var(--warning-light, #fef3cd);
  color: var(--warning-dark);
}

.badge-active {
  background: var(--success-light);
  color: var(--primary-dark);
}

.badge-inactive {
  background: var(--border);
  color: var(--text-secondary);
}

.badge-lang {
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.user-meta {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.user-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.user-actions .btn-sm {
  width: auto;
  padding: 6px 14px;
  font-size: 0.8rem;
  border-radius: 8px;
  white-space: nowrap;
}

.btn-danger-outline {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
}

.btn-danger-outline:hover {
  background: var(--danger);
  color: white;
}
</style>
