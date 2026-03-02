<template>
  <div class="page">
    <AppHeader :title="t('profile.title')" show-back back-to="/" />

    <div class="page-content">
      <div class="profile-header">
        <div class="profile-avatar">{{ initials }}</div>
        <h2 class="profile-name">{{ authStore.user?.full_name || authStore.user?.username }}</h2>
        <span class="profile-username">@{{ authStore.user?.username }}</span>
        <span class="role-badge" :class="authStore.isAdmin ? 'role-admin' : 'role-worker'">
          {{ authStore.isAdmin ? t('profile.roleAdmin') : t('profile.roleWorker') }}
        </span>
      </div>

      <div class="settings-list">
        <RouterLink v-if="authStore.isAdmin" to="/settings" class="settings-item">
          <span class="settings-icon">⚙</span>
          <div class="settings-info">
            <span class="settings-name">{{ t('profile.settings') }}</span>
          </div>
          <span class="settings-arrow">›</span>
        </RouterLink>

        <button class="settings-item logout-item" @click="showLogoutDialog = true">
          <span class="settings-icon">🚪</span>
          <div class="settings-info">
            <span class="settings-name logout-text">{{ t('profile.logout') }}</span>
          </div>
        </button>
      </div>
    </div>

    <ConfirmDialog
      :show="showLogoutDialog"
      :message="t('profile.logoutConfirm')"
      :confirm-label="t('profile.logout')"
      :cancel-label="t('common.cancel')"
      @confirm="handleLogout"
      @cancel="showLogoutDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth.js'
import { getInitials } from '../utils/initials.js'
import AppHeader from '../components/organisms/AppHeader.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const showLogoutDialog = ref(false)

const initials = computed(() => getInitials(authStore.user))

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.profile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: 32px;
  padding-top: 8px;
}

.profile-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 1.25rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.profile-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

.profile-username {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.role-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  text-transform: uppercase;
}

.role-admin {
  background: var(--success-light);
  color: var(--primary-dark);
  border: 1px solid rgba(45, 106, 79, 0.2);
}

.role-worker {
  background: #EDE9FE;
  color: #5B21B6;
  border: 1px solid rgba(109, 40, 217, 0.15);
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.settings-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--surface);
  text-decoration: none;
  color: var(--text);
  transition: background 0.15s;
  border: none;
  width: 100%;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.settings-item:active {
  background: var(--surface-2);
}

.settings-icon {
  font-size: 1.25rem;
  line-height: 1;
  flex-shrink: 0;
}

.settings-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-name {
  font-size: 0.9375rem;
  font-weight: 600;
}

.settings-arrow {
  font-size: 1.25rem;
  color: var(--text-secondary);
  line-height: 1;
}

.logout-text {
  color: var(--danger);
}
</style>
