<template>
  <div v-for="ann in visible" :key="ann.id" class="announcement-banner" :class="`banner-${ann.type}`">
    <div class="announcement-content">
      <strong>{{ ann.title }}</strong>
      <span v-if="ann.message"> — {{ ann.message }}</span>
    </div>
    <button class="dismiss-btn" :title="$t('announcements.dismiss')" @click="dismiss(ann.id)">✕</button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth.js'

const authStore = useAuthStore()
const announcements = ref([])
const dismissed = ref(new Set())

const storageKey = computed(() => `dismissed_announcements_${authStore.user?.id || 'anon'}`)

const visible = computed(() =>
  announcements.value.filter((a) => !dismissed.value.has(a.id))
)

onMounted(async () => {
  // Load dismissed IDs from localStorage (user-scoped)
  try {
    const stored = localStorage.getItem(storageKey.value)
    if (stored) dismissed.value = new Set(JSON.parse(stored))
  } catch { /* ignore */ }

  try {
    const { data } = await api.get('/announcements/active')
    announcements.value = data
  } catch { /* silent — announcements are non-critical */ }
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
.announcement-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  font-size: 0.85rem;
  gap: 12px;
}

.banner-info {
  background: #DBEAFE;
  color: #1E40AF;
  border-bottom: 1px solid #93C5FD;
}

.banner-warning {
  background: #FEF3C7;
  color: #92400E;
  border-bottom: 1px solid #FCD34D;
}

.banner-maintenance {
  background: #FEE2E2;
  color: #991B1B;
  border-bottom: 1px solid #FCA5A5;
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
