<template>
  <Transition name="slide-up">
    <div v-if="show" class="sync-panel-overlay" @click.self="$emit('close')">
      <div class="sync-panel">
        <div class="panel-header">
          <h3 class="panel-title">{{ t('sync.panelTitle') }}</h3>
          <button class="btn-close" @click="$emit('close')">&times;</button>
        </div>

        <div class="panel-body">
          <!-- Status -->
          <div class="status-row">
            <span class="status-dot" :class="dotClass" />
            <span class="status-label">{{ statusText }}</span>
          </div>

          <!-- Last sync time -->
          <div v-if="syncStore.lastSyncTime" class="info-row">
            <span class="info-label">{{ t('sync.lastSync') }}</span>
            <span class="info-value mono">{{ formatTime(syncStore.lastSyncTime) }}</span>
          </div>
          <div v-else class="info-row">
            <span class="info-label">{{ t('sync.lastSync') }}</span>
            <span class="info-value">{{ t('sync.neverSynced') }}</span>
          </div>

          <!-- Pending items -->
          <div v-if="syncStore.pendingCount > 0" class="section">
            <h4 class="section-title">{{ t('sync.pendingItems') }}</h4>
            <div v-for="(count, type) in pendingByType" :key="type" class="pending-row">
              <span class="pending-type">{{ t(`sync.entity.${type}`, [type]) }}</span>
              <span class="pending-count mono">{{ count }}</span>
            </div>
          </div>

          <!-- Failed items -->
          <div v-if="syncStore.hasFailedItems" class="section section-danger">
            <h4 class="section-title">{{ t('sync.failedItems') }}</h4>
            <div v-for="item in syncStore.failedItems.slice(0, 5)" :key="item.autoId" class="failed-row">
              <span class="failed-type">{{ t(`sync.entity.${item.entityType}`, item.entityType) }}</span>
              <span class="failed-error">{{ item.lastError }}</span>
            </div>
            <p v-if="syncStore.failedItems.length > 5" class="more-text">
              +{{ syncStore.failedItems.length - 5 }} {{ t('sync.more') }}
            </p>
          </div>

          <!-- Stale data warning -->
          <div v-if="syncStore.isStaleData" class="warning-banner">
            {{ t('sync.staleWarning') }}
          </div>
        </div>

        <div class="panel-actions">
          <button class="btn-primary" :disabled="syncStore.isSyncing" @click="handleSync">
            <span v-if="syncStore.isSyncing" class="spinner" style="width:16px;height:16px;border-width:2px" />
            <span v-else>{{ t('sync.syncNow') }}</span>
          </button>

          <button v-if="syncStore.hasFailedItems" class="btn-secondary" @click="handleRetry">
            {{ t('sync.retryFailed') }}
          </button>

          <button v-if="syncStore.hasFailedItems" class="btn-danger btn-sm-text" @click="handleClearFailed">
            {{ t('sync.clearFailed') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSyncStore } from '../../stores/sync.js'

const props = defineProps({ show: { type: Boolean, default: false } })
defineEmits(['close'])

const { t } = useI18n()
const syncStore = useSyncStore()

const pendingByType = ref({})

// Refresh pending breakdown whenever panel opens
watch(
  () => props.show,
  async (visible) => {
    if (visible) {
      pendingByType.value = await syncStore.getPendingByType()
    }
  },
  { immediate: true },
)

const DOT_MAP = { synced: 'synced', syncing: 'syncing', pending: 'pending', offline: 'offline', 'offline-pending': 'offline' }
const dotClass = computed(() => DOT_MAP[syncStore.syncStatus] || 'synced')

const statusText = computed(() => {
  const s = syncStore.syncStatus
  if (s === 'syncing') return t('sync.syncing')
  if (s === 'offline-pending') return t('sync.offlinePending', { count: syncStore.pendingCount })
  if (s === 'offline') return t('sync.offline')
  if (s === 'pending') return t('sync.pendingCount', { count: syncStore.pendingCount })
  return t('sync.synced')
})

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString()
}

async function handleSync() {
  await syncStore.triggerSync()
  pendingByType.value = await syncStore.getPendingByType()
}

async function handleRetry() {
  await syncStore.retryFailed()
  pendingByType.value = await syncStore.getPendingByType()
}

async function handleClearFailed() {
  await syncStore.clearFailed()
  pendingByType.value = await syncStore.getPendingByType()
}
</script>

<style scoped>
.sync-panel-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  z-index: 500;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sync-panel {
  background: var(--surface);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 1rem;
  font-weight: 700;
}

.btn-close {
  border: none;
  background: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.panel-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.status-dot.synced { background: var(--synced); }
.status-dot.syncing { background: var(--warning); animation: pulse 1s infinite; }
.status-dot.pending { background: var(--warning); }
.status-dot.offline { background: var(--danger); }

.status-label {
  font-weight: 600;
  font-size: 0.9375rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.info-label {
  color: var(--text-secondary);
}

.info-value {
  font-weight: 500;
}

.section {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.section-title {
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.section-danger .section-title {
  color: var(--danger);
}

.pending-row, .failed-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 0.875rem;
}

.pending-count {
  font-weight: 600;
  color: var(--warning);
}

.failed-type {
  font-weight: 500;
}

.failed-error {
  font-size: 0.75rem;
  color: var(--danger);
  max-width: 60%;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-align: center;
  margin-top: 4px;
}

.warning-banner {
  background: rgba(217, 119, 6, 0.1);
  border: 1px solid rgba(217, 119, 6, 0.3);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 0.8125rem;
  color: var(--warning);
  font-weight: 500;
}

.panel-actions {
  padding: 12px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-sm-text {
  width: auto;
  font-size: 0.8125rem;
  background: none;
  border: none;
  color: var(--danger);
  cursor: pointer;
  padding: 8px;
  font-weight: 500;
  align-self: center;
}

.btn-sm-text:active {
  opacity: 0.7;
}

/* Transition — classes applied to .sync-panel-overlay (direct child of <Transition>) */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.3s ease;
}

.slide-up-enter-active .sync-panel,
.slide-up-leave-active .sync-panel {
  transition: transform 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
}

.slide-up-enter-from .sync-panel,
.slide-up-leave-to .sync-panel {
  transform: translateY(100%);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
