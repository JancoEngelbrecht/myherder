<template>
  <nav class="bottom-nav">
    <RouterLink
      v-for="tab in visibleTabs"
      :key="tab.name"
      :to="tab.to"
      class="nav-tab"
      :class="{ active: isActive(tab) }"
    >
      <span class="nav-icon">{{ tab.icon }}</span>
      <span class="nav-label">{{ t(tab.labelKey) }}</span>
    </RouterLink>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useFeatureFlagsStore } from '../../stores/featureFlags.js'
import { useAuthStore } from '../../stores/auth.js'

const { t } = useI18n()
const route = useRoute()
const featureFlagsStore = useFeatureFlagsStore()
const authStore = useAuthStore()

const allTabs = [
  { name: 'home',  to: '/',      icon: '🏠', labelKey: 'nav.home' },
  { name: 'cows',  to: '/cows',  icon: '🐄', labelKey: 'nav.cows' },
  { name: 'milk',  to: '/milk',  icon: '🥛', labelKey: 'nav.milk',  flag: 'milkRecording', permission: 'can_record_milk' },
  { name: 'breed', to: '/breed', icon: '🐂', labelKey: 'nav.breed', flag: 'breeding', permission: 'can_log_breeding' },
]

const visibleTabs = computed(() =>
  allTabs.filter((tab) => {
    if (tab.flag && !featureFlagsStore.flags[tab.flag]) return false
    if (tab.permission && !authStore.hasPermission(tab.permission)) return false
    return true
  }),
)

function isActive(tab) {
  if (tab.name === 'home') return route.path === '/'
  if (tab.name === 'cows') return route.path.startsWith('/cows')
  if (tab.name === 'breed') return route.path.startsWith('/breed')
  return route.path === tab.to
}
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(var(--nav-height) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  justify-content: space-around;
  z-index: 200;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
}

.nav-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex: 1;
  height: var(--nav-height);
  color: var(--text-muted);
  transition: color 0.15s;
  text-decoration: none;
  padding-top: 8px;
}

.nav-tab.active {
  color: var(--primary);
}

.nav-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.nav-label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>
