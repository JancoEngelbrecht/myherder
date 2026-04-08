<template>
  <nav class="bottom-nav">
    <RouterLink
      v-for="tab in visibleTabs"
      :key="tab.name"
      :to="tab.to"
      class="nav-tab"
      :class="{ active: isActive(tab) }"
      :aria-current="isActive(tab) ? 'page' : undefined"
    >
      <span class="nav-icon">
        <AppIcon :name="tab.icon" :size="22" :stroke-width="1.5" />
      </span>
      <span class="nav-label">{{ t(tab.labelKey) }}</span>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useFeatureFlagsStore } from '../../stores/featureFlags'
import { useAuthStore } from '../../stores/auth'
import { useSpeciesTerms } from '../../composables/useSpeciesTerms'
import AppIcon from '../atoms/AppIcon.vue'

const { t } = useI18n()
const route = useRoute()
const featureFlagsStore = useFeatureFlagsStore()
const authStore = useAuthStore()
const { icon: speciesIcon, speciesCode } = useSpeciesTerms()

const animalsLabelKey = computed(() => (speciesCode.value === 'sheep' ? 'nav.sheep' : 'nav.cows'))

const allTabs = computed(() => [
  { name: 'home', to: '/', icon: 'home', labelKey: 'nav.home' },
  {
    name: 'animals',
    to: '/animals',
    icon: speciesIcon.value.female,
    labelKey: animalsLabelKey.value,
  },
  {
    name: 'milk',
    to: '/milk',
    icon: 'milk-bucket',
    labelKey: 'nav.milk',
    flag: 'milkRecording',
    permission: 'can_record_milk',
  },
  {
    name: 'breed',
    to: '/breed',
    icon: speciesCode.value === 'sheep' ? 'dna' : speciesIcon.value.male,
    labelKey: 'nav.breed',
    flag: 'breeding',
    permission: 'can_log_breeding',
  },
])

const visibleTabs = computed(() =>
  allTabs.value.filter((tab) => {
    if (tab.flag && !featureFlagsStore.flags[tab.flag]) return false
    if (tab.permission && !authStore.hasPermission(tab.permission)) return false
    return true
  })
)

function isActive(tab) {
  if (tab.name === 'home') return route.path === '/'
  if (tab.name === 'animals')
    return route.path.startsWith('/animals') || route.path.startsWith('/cows')
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
  box-shadow:
    0 -1px 0 var(--border),
    0 -4px 16px rgba(0, 0, 0, 0.04);
}

.nav-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: 1;
  height: var(--nav-height);
  color: var(--text-muted);
  transition:
    color 0.2s,
    transform 0.15s;
  text-decoration: none;
  padding-top: 8px;
  position: relative;
}

.nav-tab:active {
  transform: scale(0.92);
}

.nav-tab.active {
  color: var(--primary);
}

/* Pill background behind active tab */
.nav-tab.active::before {
  content: '';
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 52px;
  height: 34px;
  border-radius: var(--radius-lg);
  background: var(--primary-bg);
  transition: opacity 0.2s;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  position: relative;
}

.nav-label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
}
</style>
