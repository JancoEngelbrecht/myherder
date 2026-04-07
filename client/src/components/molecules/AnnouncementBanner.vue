<template>
  <div v-if="visible.length" class="announcement-stack">
    <div
      v-for="ann in visible"
      :key="ann.id"
      class="announcement-banner"
      :class="`banner-${ann.type}`"
    >
      <div class="announcement-content">
        <strong>{{ ann.title }}</strong>
        <span v-if="ann.message"> — {{ ann.message }}</span>
      </div>
      <button class="dismiss-btn" :title="$t('announcements.dismiss')" @click="dismiss(ann.id)">
        ✕
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth'

const authStore = useAuthStore()
const announcements = ref([])
const dismissed = ref(new Set())

const storageKey = computed(() => `dismissed_announcements_${authStore.user?.id || 'anon'}`)

const visible = computed(() => announcements.value.filter((a) => !dismissed.value.has(a.id)))

onMounted(async () => {
  // Load dismissed IDs from localStorage (user-scoped)
  try {
    const stored = localStorage.getItem(storageKey.value)
    if (stored) dismissed.value = new Set(JSON.parse(stored))
  } catch {
    /* ignore */
  }

  try {
    const { data } = await api.get('/announcements/active')
    announcements.value = data
  } catch {
    /* silent — announcements are non-critical */
  }
})

function dismiss(id) {
  dismissed.value.add(id)
  // Persist to localStorage (user-scoped)
  localStorage.setItem(storageKey.value, JSON.stringify([...dismissed.value]))
  // Try server-side dismissal (best effort)
  api.post(`/announcements/${id}/dismiss`).catch(() => {})
}
</script>

<style scoped>
.announcement-stack {
  position: fixed;
  top: var(--header-height);
  left: 0;
  right: 0;
  z-index: 200;
}

.announcement-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  font-size: 0.85rem;
  gap: 12px;
}

.banner-info {
  background: var(--announce-info-bg);
  color: var(--announce-info-text);
  border-bottom: 1px solid var(--announce-info-border);
}

.banner-warning {
  background: var(--announce-warning-bg);
  color: var(--announce-warning-text);
  border-bottom: 1px solid var(--announce-warning-border);
}

.banner-maintenance {
  background: var(--announce-maintenance-bg);
  color: var(--announce-maintenance-text);
  border-bottom: 1px solid var(--announce-maintenance-border);
}

.announcement-content {
  flex: 1;
  line-height: 1.3;
}

.dismiss-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  opacity: 0.6;
  padding: 4px;
  color: inherit;
}

.dismiss-btn:hover {
  opacity: 1;
}
</style>
