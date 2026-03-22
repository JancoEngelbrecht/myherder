<template>
  <button class="sync-indicator" :class="indicatorClass" :title="label" @click="$emit('click')">
    <span class="dot" />
    <span v-if="showCount" class="badge mono">{{ syncStore.pendingCount }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSyncStore } from '../../stores/sync.js'

defineEmits(['click'])

const { t } = useI18n()
const syncStore = useSyncStore()

const indicatorClass = computed(() => {
  const s = syncStore.syncStatus
  if (s === 'syncing') return 'syncing'
  if (s === 'offline-pending' || s === 'offline') return 'offline'
  if (s === 'pending') return 'pending'
  return 'synced'
})

const showCount = computed(() => syncStore.pendingCount > 0)

const label = computed(() => {
  const s = syncStore.syncStatus
  if (s === 'syncing') return t('sync.syncing')
  if (s === 'offline-pending') return t('sync.offlinePending', { count: syncStore.pendingCount })
  if (s === 'offline') return t('sync.offline')
  if (s === 'pending') return t('sync.pendingCount', { count: syncStore.pendingCount })
  return t('sync.synced')
})
</script>

<style scoped>
.sync-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 4px;
  border: none;
  background: none;
  cursor: pointer;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: block;
  transition: background 0.3s;
}

.badge {
  font-size: 0.625rem;
  font-weight: 700;
  color: var(--text-secondary);
  line-height: 1;
}

.synced .dot {
  background: var(--synced);
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.5);
}

.syncing .dot {
  background: var(--warning);
  box-shadow: 0 0 4px rgba(217, 119, 6, 0.5);
  animation: pulse 1s infinite;
}

.pending .dot {
  background: var(--warning);
  box-shadow: 0 0 4px rgba(217, 119, 6, 0.5);
}

.offline .dot {
  background: var(--danger);
  box-shadow: 0 0 4px rgba(220, 38, 38, 0.4);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
