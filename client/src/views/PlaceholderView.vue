<template>
  <div class="page">
    <AppHeader :title="routeTitle" show-back back-to="/" />
    <div class="page-content">
      <div class="placeholder-content">
        <div class="placeholder-icon">{{ routeIcon }}</div>
        <h2 class="placeholder-title">{{ t('placeholder.title') }}</h2>
        <p class="placeholder-subtitle">{{ t('placeholder.subtitle') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppHeader from '../components/organisms/AppHeader.vue'

const { t } = useI18n()
const route = useRoute()

const routeMap = {
  log:   { title: 'nav.log',   icon: '📋' },
  milk:  { title: 'nav.milk',  icon: '🥛' },
  breed: { title: 'nav.breed', icon: '🐂' },
}

const routeTitle = computed(() => {
  const name = route.name
  return t(routeMap[name]?.title || 'nav.home')
})

const routeIcon = computed(() => routeMap[route.name]?.icon || '🏗')
</script>

<style scoped>
.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  text-align: center;
  gap: 12px;
  padding: 24px;
}

.placeholder-icon {
  font-size: 3.5rem;
  opacity: 0.35;
}

.placeholder-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.placeholder-subtitle {
  font-size: 0.9375rem;
  color: var(--text-muted);
  max-width: 260px;
  line-height: 1.6;
}
</style>
