<template>
  <header class="app-header">
    <div class="header-left">
      <button v-if="showBack" class="btn-icon" :aria-label="t('common.back')" @click="handleBack">
        ‹
      </button>
    </div>

    <div class="header-title">
      <slot name="title">{{ title }}</slot>
    </div>

    <div class="header-right">
      <slot name="right">
        <div class="header-actions">
          <!-- Farm switcher pill — only shown when user has 2+ farms -->
          <div v-if="showFarmSwitcher" class="farm-switcher" @click.stop="toggleFarmDropdown">
            <span class="farm-pill">
              {{ farmPillLabel }}
              <span class="farm-pill-arrow">{{ farmDropdownOpen ? '▴' : '▾' }}</span>
            </span>
            <div v-if="farmDropdownOpen" class="farm-dropdown" @click.stop>
              <button
                v-for="farm in authStore.myFarms"
                :key="farm.id"
                class="farm-option"
                :class="{ 'farm-option-active': farm.id === authStore.user?.farm_id }"
                :disabled="switching"
                @click="handleSwitchFarm(farm.id)"
              >
                <span class="farm-option-emoji">{{
                  farm.species?.code === 'sheep' ? '🐑' : '🐄'
                }}</span>
                <span class="farm-option-name">{{ farm.name }}</span>
              </button>
            </div>
          </div>

          <SyncIndicator @click="showSyncPanel = true" />
          <SyncPanel :show="showSyncPanel" @close="showSyncPanel = false" />
          <button
            class="lang-toggle"
            :title="locale === 'en' ? t('common.switchToAfrikaans') : t('common.switchToEnglish')"
            @click="toggleLang"
          >
            {{ locale === 'en' ? 'AF' : 'EN' }}
          </button>
          <RouterLink
            v-if="showAvatar"
            to="/profile"
            class="avatar-circle"
            :aria-label="t('common.profile')"
          >
            {{ initials }}
          </RouterLink>
        </div>
      </slot>
    </div>
  </header>

  <ConfirmDialog
    :show="pendingSyncWarning"
    :message="t('sync.pendingSwitchWarning', { count: pendingSyncCount })"
    :confirm-label="t('sync.switchAnyway')"
    :cancel-label="t('common.cancel')"
    :loading="switching"
    @confirm="confirmPendingSwitch"
    @cancel="cancelPendingSwitch"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth'
import { getInitials } from '../../utils/initials'
import SyncIndicator from '../atoms/SyncIndicator.vue'
import SyncPanel from '../molecules/SyncPanel.vue'
import ConfirmDialog from '../molecules/ConfirmDialog.vue'
import { extractApiError, resolveError } from '../../utils/apiError'
import { useToast } from '../../composables/useToast'

const showSyncPanel = ref(false)
const farmDropdownOpen = ref(false)
const switching = ref(false)
const pendingSyncWarning = ref(false)
const pendingSyncCount = ref(0)
const pendingSwitchFarmId = ref(null)

const authStore = useAuthStore()
const { showToast } = useToast()

const props = defineProps({
  title: { type: String, default: 'MyHerder' },
  showBack: { type: Boolean, default: false },
  backTo: { type: String, default: null },
  showAvatar: { type: Boolean, default: false },
})

const initials = computed(() => getInitials(authStore.user))

const router = useRouter()
const { t, locale } = useI18n()

// Show switcher only for non-super-admin users with 2+ farms
const showFarmSwitcher = computed(() => {
  if (authStore.isSuperAdmin) return false
  return authStore.myFarms.length > 1
})

const farmPillLabel = computed(() => {
  const farm = authStore.myFarms.find((f) => f.id === authStore.user?.farm_id)
  const speciesCode = farm?.species?.code ?? authStore.user?.species_code ?? 'cattle'
  const emoji = speciesCode === 'sheep' ? '🐑' : '🐄'
  return `${emoji} ${farm?.name ?? ''}`
})

function handleBack() {
  if (window.history.state?.back) {
    router.back()
  } else if (props.backTo) {
    router.push(props.backTo)
  } else {
    router.push('/')
  }
}

function toggleLang() {
  const next = locale.value === 'en' ? 'af' : 'en'
  locale.value = next
  localStorage.setItem('locale', next)
}

function toggleFarmDropdown() {
  farmDropdownOpen.value = !farmDropdownOpen.value
}

function closeFarmDropdown() {
  farmDropdownOpen.value = false
}

async function handleSwitchFarm(farmId, { force = false } = {}) {
  if (farmId === authStore.user?.farm_id) {
    closeFarmDropdown()
    return
  }
  switching.value = true
  try {
    await authStore.switchFarm(farmId, { force })
    closeFarmDropdown()
    // Navigate to dashboard to reload all farm-scoped data
    router.push('/')
  } catch (err) {
    if (err.message === 'PENDING_SYNC') {
      pendingSyncCount.value = err.pendingCount
      pendingSwitchFarmId.value = farmId
      pendingSyncWarning.value = true
    } else {
      showToast(resolveError(extractApiError(err), t), 'error')
    }
  } finally {
    switching.value = false
  }
}

function cancelPendingSwitch() {
  pendingSyncWarning.value = false
  pendingSwitchFarmId.value = null
}

async function confirmPendingSwitch() {
  try {
    await handleSwitchFarm(pendingSwitchFarmId.value, { force: true })
  } finally {
    pendingSyncWarning.value = false
    pendingSwitchFarmId.value = null
  }
}

// Close dropdown when clicking outside
function handleOutsideClick() {
  if (farmDropdownOpen.value) closeFarmDropdown()
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  // Load farms if not yet loaded (e.g. restored from localStorage on hydrate)
  if (!authStore.isSuperAdmin && authStore.myFarms.length === 0 && authStore.isAuthenticated) {
    authStore.fetchMyFarms().catch(() => {})
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: rgba(255, 255, 255, 0.85);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 8px;
  z-index: 200;
  box-shadow: var(--shadow-sm);
}

.header-left,
.header-right {
  min-width: 72px;
  display: flex;
  align-items: center;
}

.header-right {
  justify-content: flex-end;
}

.header-title {
  flex: 1;
  text-align: center;
  font-weight: 700;
  font-size: 1rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lang-toggle {
  padding: 4px 9px;
  border-radius: var(--radius-full);
  background: var(--surface-2);
  color: var(--text-secondary);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  border: 1px solid var(--border-strong);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.lang-toggle:hover {
  background: var(--border);
  color: var(--text);
}

.lang-toggle:active {
  background: var(--border-strong);
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius);
  border: none;
  background: transparent;
  font-size: 1.5rem;
  color: var(--text);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
  line-height: 1;
}

.btn-icon:hover {
  background: var(--surface-2);
}

.btn-icon:active {
  background: var(--border);
}

.avatar-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  text-decoration: none;
  line-height: 1;
  flex-shrink: 0;
  border: 2px solid var(--primary-ring);
  transition: transform 0.15s;
}

.avatar-circle:hover {
  transform: scale(1.08);
}

/* Farm switcher */
.farm-switcher {
  position: relative;
}

.farm-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: var(--radius-full, 999px);
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
}

.farm-pill-arrow {
  font-size: 0.625rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.farm-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 300;
  overflow: hidden;
}

.farm-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  text-align: left;
  font-size: 0.875rem;
  color: var(--text);
  cursor: pointer;
  transition: background 0.1s;
}

.farm-option:hover:not(:disabled) {
  background: var(--surface-2);
}

.farm-option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.farm-option-active {
  font-weight: 700;
  color: var(--primary);
}

.farm-option-emoji {
  font-size: 1rem;
  flex-shrink: 0;
}

.farm-option-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
