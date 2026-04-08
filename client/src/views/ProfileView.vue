<template>
  <div class="page">
    <AppHeader :title="t('profile.title')" show-back back-to="/" />

    <div class="page-content">
      <div class="profile-header">
        <div class="profile-avatar">{{ initials }}</div>
        <h2 class="profile-name">{{ authStore.user?.full_name || authStore.user?.username }}</h2>
        <span class="profile-username">@{{ authStore.user?.username }}</span>
        <span
          class="role-badge"
          :class="
            authStore.isSuperAdmin ? 'role-super' : authStore.isAdmin ? 'role-admin' : 'role-worker'
          "
        >
          {{
            authStore.isSuperAdmin
              ? t('profile.roleSuperAdmin')
              : authStore.isAdmin
                ? t('profile.roleAdmin')
                : t('profile.roleWorker')
          }}
        </span>
      </div>

      <div class="settings-list">
        <RouterLink v-if="authStore.isAdmin && hasFarmContext" to="/settings" class="settings-item">
          <span class="settings-icon">
            <AppIcon name="settings" :size="20" :stroke-width="1.5" />
          </span>
          <div class="settings-info">
            <span class="settings-name">{{ t('profile.settings') }}</span>
          </div>
          <span class="settings-arrow">
            <AppIcon name="chevron-right" :size="16" :stroke-width="2" />
          </span>
        </RouterLink>

        <RouterLink to="/help" class="settings-item">
          <span class="settings-icon">
            <AppIcon name="book-open" :size="20" :stroke-width="1.5" />
          </span>
          <div class="settings-info">
            <span class="settings-name">{{ t('help.title') }}</span>
          </div>
          <span class="settings-arrow">
            <AppIcon name="chevron-right" :size="16" :stroke-width="2" />
          </span>
        </RouterLink>

        <button class="settings-item logout-item" @click="showLogoutDialog = true">
          <span class="settings-icon settings-icon-danger">
            <AppIcon name="log-out" :size="20" :stroke-width="1.5" />
          </span>
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

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { getInitials } from '../utils/initials'
import AppHeader from '../components/organisms/AppHeader.vue'
import AppIcon from '../components/atoms/AppIcon.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const showLogoutDialog = ref(false)

const initials = computed(() => getInitials(authStore.user))
const hasFarmContext = computed(() => !!authStore.user?.farm_id)

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
  gap: 8px;
  margin-bottom: 32px;
  padding-top: 8px;
}

.profile-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 1.5rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  box-shadow: var(--shadow-colored);
  border: 3px solid rgba(255, 255, 255, 0.9);
  outline: 2px solid var(--primary-ring);
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
  letter-spacing: 0.06em;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  text-transform: uppercase;
  box-shadow: var(--shadow-sm);
}

.role-admin {
  background: var(--success-light);
  color: var(--primary-dark);
  border: 1px solid rgba(4, 120, 87, 0.2);
}

.role-worker {
  background: var(--badge-pregnant-bg);
  color: var(--badge-pregnant-text);
  border: 1px solid rgba(91, 33, 182, 0.15);
}

.role-super {
  background: var(--warning-light);
  color: var(--warning-dark);
  border: 1px solid rgba(146, 64, 14, 0.2);
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

@media (hover: hover) {
  .settings-item:hover {
    background: var(--surface-2);
  }
}

.settings-item:active {
  background: var(--surface-2);
}

.settings-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--primary);
  flex-shrink: 0;
}

.settings-icon-danger {
  color: var(--danger);
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
  display: flex;
  align-items: center;
  color: var(--text-secondary);
}

.logout-text {
  color: var(--danger);
}
</style>
