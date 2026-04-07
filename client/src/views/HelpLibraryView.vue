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
            <span class="help-topic-icon">{{ topic.icon }}</span>
            <span class="help-topic-name">{{ t(`help.topics.${topic.slug}.title`) }}</span>
            <span class="help-topic-arrow">›</span>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import AppHeader from '../components/organisms/AppHeader.vue'

const { t } = useI18n()
const authStore = useAuthStore()

const categories = [
  {
    key: 'dailyTasks',
    topics: [
      { slug: 'recording-milk', icon: '🥛' },
      { slug: 'milk-history', icon: '📊' },
    ],
  },
  {
    key: 'healthTreatment',
    topics: [
      { slug: 'logging-health-issue', icon: '🩺' },
      { slug: 'adding-treatment', icon: '💊' },
      { slug: 'withdrawal-periods', icon: '⏳' },
      { slug: 'resolving-health-issue', icon: '✅' },
    ],
  },
  {
    key: 'breeding',
    topics: [
      { slug: 'breeding-lifecycle', icon: '🔄', route: '/help/breeding-lifecycle' },
      { slug: 'logging-heat', icon: '🌡' },
      { slug: 'logging-insemination', icon: '💉' },
      { slug: 'pregnancy-check', icon: '🤰' },
      { slug: 'dry-off', icon: '🚫' },
      { slug: 'logging-calving', icon: '🐄' },
      { slug: 'breeding-notifications', icon: '🔔' },
    ],
  },
  {
    key: 'cowManagement',
    topics: [
      { slug: 'adding-cow', icon: '➕' },
      { slug: 'cow-status', icon: '📋' },
      { slug: 'cow-details', icon: '🔍' },
    ],
  },
  {
    key: 'adminSettings',
    adminOnly: true,
    topics: [
      { slug: 'managing-users', icon: '👥' },
      { slug: 'managing-breed-types', icon: '🐮' },
      { slug: 'managing-issue-types', icon: '🏷' },
      { slug: 'managing-medications', icon: '💊' },
      { slug: 'feature-flags', icon: '🚩' },
      { slug: 'farm-settings', icon: '⚙' },
      { slug: 'running-reports', icon: '📄' },
      { slug: 'audit-log', icon: '📝' },
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
  font-size: 1.25rem;
  flex-shrink: 0;
  width: 28px;
  text-align: center;
}

.help-topic-name {
  flex: 1;
  font-size: 0.9375rem;
  font-weight: 500;
}

.help-topic-arrow {
  font-size: 1.25rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}
</style>
