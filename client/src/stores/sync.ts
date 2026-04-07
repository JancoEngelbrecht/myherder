import { defineStore } from 'pinia'
import { computed } from 'vue'
import {
  isOnline,
  pendingCount,
  isSyncing,
  lastSyncTime,
  failedItems,
  sync,
  initialSync,
  getPending,
} from '../services/syncManager'
import db from '../db/indexedDB'

export const useSyncStore = defineStore('sync', () => {
  // ── Computed status ────────────────────────────────────────────

  const syncStatus = computed(() => {
    if (isSyncing.value) return 'syncing'
    if (!isOnline.value && pendingCount.value > 0) return 'offline-pending'
    if (!isOnline.value) return 'offline'
    if (pendingCount.value > 0) return 'pending'
    return 'synced'
  })

  const hasFailedItems = computed(() => failedItems.value.length > 0)

  const isStaleData = computed(() => {
    if (!lastSyncTime.value) return false // No sync yet — don't warn until first sync completes
    const hours = (Date.now() - new Date(lastSyncTime.value).getTime()) / (1000 * 60 * 60)
    return hours > 24
  })

  const queueOverflow = computed(() => pendingCount.value > 100)

  // ── Actions ────────────────────────────────────────────────────

  async function triggerSync() {
    await sync()
  }

  async function forceFullSync() {
    await initialSync(true)
  }

  async function retryFailed() {
    // Reset attempts on failed items so they get retried
    const failed = await db.syncQueue.where('attempts').aboveOrEqual(5).toArray()
    for (const entry of failed) {
      await db.syncQueue.update(entry.autoId, { attempts: 0, lastError: null })
    }
    await sync()
  }

  async function clearFailed() {
    const failed = await db.syncQueue.where('attempts').aboveOrEqual(5).toArray()
    await db.syncQueue.bulkDelete(failed.map((e: any) => e.autoId))
  }

  async function getPendingByType(): Promise<Record<string, number>> {
    const pending = await getPending()
    const grouped: Record<string, number> = {}
    for (const entry of pending) {
      grouped[entry.entityType] = (grouped[entry.entityType] || 0) + 1
    }
    return grouped
  }

  return {
    // Reactive state (pass-through from syncManager)
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncTime,
    failedItems,

    // Computed
    syncStatus,
    hasFailedItems,
    isStaleData,
    queueOverflow,

    // Actions
    triggerSync,
    forceFullSync,
    retryFailed,
    clearFailed,
    getPendingByType,
  }
})
