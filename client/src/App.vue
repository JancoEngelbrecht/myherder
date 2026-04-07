<template>
  <template v-if="authStore.hydrated">
    <!-- Offline mode banner -->
    <div
      v-if="authStore.isAuthenticated && authStore.isOfflineMode"
      class="app-banner banner-warning"
    >
      {{ t('sync.offlineBanner') }}
    </div>

    <!-- Stale data warning -->
    <div
      v-else-if="authStore.isAuthenticated && syncStore.isStaleData && !syncStore.isSyncing"
      class="app-banner banner-info"
    >
      {{ t('sync.staleWarning') }}
    </div>

    <!-- Queue overflow warning -->
    <div
      v-else-if="authStore.isAuthenticated && syncStore.queueOverflow"
      class="app-banner banner-warning"
    >
      {{ t('sync.queueOverflow') }}
    </div>

    <!-- DB recovery banner -->
    <div v-else-if="dbRecovered" class="app-banner banner-info" @click="clearRecoveredFlag">
      {{ t('sync.cacheReset') }}
    </div>

    <!-- Farm context banner for super-admin -->
    <div v-if="authStore.isInFarmContext" class="app-banner banner-farm" @click="handleExitFarm">
      {{ t('superAdmin.viewingFarm', { name: authStore.activeFarmName || '' }) }} —
      {{ t('superAdmin.exitFarm') }}
    </div>

    <!-- System announcements -->
    <AnnouncementBanner v-if="authStore.isAuthenticated" />

    <RouterView v-slot="{ Component, route }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
    <BottomNav v-if="authStore.isAuthenticated && showBottomNav" />
    <ToastMessage />
  </template>
</template>

<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useSyncStore } from './stores/sync'
import BottomNav from './components/organisms/BottomNav.vue'
import ToastMessage from './components/molecules/ToastMessage.vue'
import AnnouncementBanner from './components/molecules/AnnouncementBanner.vue'
import { init as initSync, destroyListeners as destroySync } from './services/syncManager'
import { dbRecovered, clearRecoveredFlag } from './db/indexedDB'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const syncStore = useSyncStore()

// Hide BottomNav when super-admin has no farm context
const showBottomNav = computed(() => {
  if (authStore.isSuperAdmin && !authStore.user?.farm_id) return false
  return true
})

async function handleExitFarm() {
  await authStore.exitFarm()
  router.push('/super/farms')
}

// Start sync engine only after hydration completes and user is authenticated
let syncInitialized = false
watch(
  () => authStore.isAuthenticated && authStore.hydrated,
  async (ready) => {
    if (ready && !syncInitialized) {
      await initSync()
      syncInitialized = true
    }
    if (!ready && syncInitialized) {
      destroySync()
      syncInitialized = false
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (syncInitialized) destroySync()
})
</script>

<style>
.app-banner {
  position: fixed;
  top: var(--header-height);
  left: 0;
  right: 0;
  z-index: 199;
  padding: 6px 16px;
  font-size: 0.8125rem;
  font-weight: 500;
  text-align: center;
}

.banner-warning {
  background: rgba(217, 119, 6, 0.15);
  color: var(--warning);
  border-bottom: 1px solid rgba(217, 119, 6, 0.3);
}

.banner-info {
  background: rgba(4, 120, 87, 0.1);
  color: var(--primary);
  border-bottom: 1px solid rgba(4, 120, 87, 0.2);
}

.banner-farm {
  background: rgba(79, 70, 229, 0.12);
  color: #4f46e5;
  border-bottom: 1px solid rgba(79, 70, 229, 0.25);
  cursor: pointer;
}
</style>
