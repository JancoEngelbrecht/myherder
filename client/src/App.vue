<template>
  <template v-if="authStore.hydrated">
    <!-- Offline mode banner -->
    <div v-if="authStore.isAuthenticated && authStore.isOfflineMode" class="app-banner banner-warning">
      {{ t('sync.offlineBanner') }}
    </div>

    <!-- Stale data warning -->
    <div v-else-if="authStore.isAuthenticated && syncStore.isStaleData && !syncStore.isSyncing" class="app-banner banner-info">
      {{ t('sync.staleWarning') }}
    </div>

    <!-- Queue overflow warning -->
    <div v-else-if="authStore.isAuthenticated && syncStore.queueOverflow" class="app-banner banner-warning">
      {{ t('sync.queueOverflow') }}
    </div>

    <!-- DB recovery banner -->
    <div v-else-if="dbRecovered" class="app-banner banner-info" @click="clearRecoveredFlag">
      {{ t('sync.cacheReset') }}
    </div>

    <RouterView v-slot="{ Component, route }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
    <BottomNav v-if="authStore.isAuthenticated" />
    <ToastMessage />
  </template>
</template>

<script setup>
import { watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from './stores/auth.js'
import { useSyncStore } from './stores/sync.js'
import BottomNav from './components/organisms/BottomNav.vue'
import ToastMessage from './components/molecules/ToastMessage.vue'
import { init as initSync, destroyListeners as destroySync } from './services/syncManager.js'
import { dbRecovered, clearRecoveredFlag } from './db/indexedDB.js'

const { t } = useI18n()
const authStore = useAuthStore()
const syncStore = useSyncStore()

// Start sync engine when user is authenticated
let syncInitialized = false
watch(
  () => authStore.isAuthenticated,
  async (authed) => {
    if (authed && !syncInitialized) {
      await initSync()
      syncInitialized = true
    }
    if (!authed && syncInitialized) {
      destroySync()
      syncInitialized = false
    }
  },
  { immediate: true },
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
  background: rgba(224, 124, 36, 0.15);
  color: var(--warning);
  border-bottom: 1px solid rgba(224, 124, 36, 0.3);
}

.banner-info {
  background: rgba(45, 106, 79, 0.1);
  color: var(--primary);
  border-bottom: 1px solid rgba(45, 106, 79, 0.2);
}
</style>
