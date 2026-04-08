<template>
  <div class="page">
    <AppHeader :title="t('help.title')" show-back back-to="/profile" />

    <div class="page-content">
      <div v-for="cat in visibleCategories" :key="cat.key" class="help-category">
        <h3 class="help-category-title">{{ t(`help.categories.${cat.key}`) }}</h3>
        <div class="help-topic-list">
          <RouterLink
            v-for="topic in cat.topics"
            :key="topic.slug"
            :to="topic.route || `/help/${topic.slug}`"
            class="help-topic-item"
          >
            <span class="help-topic-icon"><AppIcon :name="topic.icon" :size="22" /></span>
            <span class="help-topic-name">{{ t(`help.topics.${topic.slug}.title`) }}</span>
            <span class="help-topic-arrow"><AppIcon name="chevron-right" :size="16" /></span>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import AppHeader from '../components/organisms/AppHeader.vue'
import AppIcon from '../components/atoms/AppIcon.vue'

const { t } = useI18n()
const authStore = useAuthStore()

const categories = [
  {
    key: 'dailyTasks',
    topics: [
      { slug: 'recording-milk', icon: 'milk' },
      { slug: 'milk-history', icon: 'bar-chart-2' },
    ],
  },
  {
    key: 'healthTreatment',
    topics: [
      { slug: 'logging-health-issue', icon: 'stethoscope' },
      { slug: 'adding-treatment', icon: 'pill' },
      { slug: 'withdrawal-periods', icon: 'clock' },
      { slug: 'resolving-health-issue', icon: 'check-circle' },
    ],
  },
  {
    key: 'breeding',
    topics: [
      { slug: 'breeding-lifecycle', icon: 'refresh-cw', route: '/help/breeding-lifecycle' },
      { slug: 'logging-heat', icon: 'thermometer' },
      { slug: 'logging-insemination', icon: 'syringe' },
      { slug: 'pregnancy-check', icon: 'heart-pulse' },
      { slug: 'dry-off', icon: 'leaf' },
      { slug: 'logging-calving', icon: 'baby' },
      { slug: 'breeding-notifications', icon: 'bell' },
    ],
  },
  {
    key: 'cowManagement',
    topics: [
      { slug: 'adding-cow', icon: 'plus' },
      { slug: 'cow-status', icon: 'clipboard-list' },
      { slug: 'cow-details', icon: 'search' },
    ],
  },
  {
    key: 'adminSettings',
    adminOnly: true,
    topics: [
      { slug: 'managing-users', icon: 'users' },
      { slug: 'managing-breed-types', icon: 'dna' },
      { slug: 'managing-issue-types', icon: 'tag' },
      { slug: 'managing-medications', icon: 'pill' },
      { slug: 'feature-flags', icon: 'toggle-right' },
      { slug: 'farm-settings', icon: 'settings' },
      { slug: 'running-reports', icon: 'file-text' },
      { slug: 'audit-log', icon: 'list' },
    ],
  },
]

const visibleCategories = computed(() =>
  categories.filter((cat) => !cat.adminOnly || authStore.isAdmin)
)
</script>

<style scoped>
.help-category {
  margin-bottom: 24px;
}

.help-category-title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
  padding: 0 4px;
}

.help-topic-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.help-topic-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--surface);
  text-decoration: none;
  color: var(--text);
  transition: background 0.15s;
}

.help-topic-item:active {
  background: var(--surface-2);
}

.help-topic-icon {
  flex-shrink: 0;
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.help-topic-name {
  flex: 1;
  font-size: 0.9375rem;
  font-weight: 500;
}

.help-topic-arrow {
  color: var(--text-secondary);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
</style>
