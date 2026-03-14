<template>
  <div class="page">
    <AppHeader :title="t('globalDefaults.title')" show-back back-to="/" />

    <div class="page-content">
      <div class="actions-grid">
        <RouterLink to="/super/global/medications" class="action-card active-action">
          <span class="action-icon">💊</span>
          <span class="action-label">{{ t('globalDefaults.medications') }}</span>
        </RouterLink>
        <RouterLink to="/super/global/issue-types" class="action-card active-action">
          <span class="action-icon">🩺</span>
          <span class="action-label">{{ t('globalDefaults.issueTypes') }}</span>
        </RouterLink>
        <RouterLink to="/super/global/breed-types" class="action-card active-action">
          <span class="action-icon">🐄</span>
          <span class="action-label">{{ t('globalDefaults.breedTypes') }}</span>
        </RouterLink>
        <RouterLink to="/super/global/push" class="action-card active-action">
          <span class="action-icon">📤</span>
          <span class="action-label">{{ t('globalDefaults.pushDefaults') }}</span>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'

const { t } = useI18n()
</script>

<style scoped>
.actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.action-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: var(--shadow-card);
  text-decoration: none;
  aspect-ratio: 4 / 3;
  text-align: center;
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.15s, border-color 0.15s;
  color: var(--text);
}

.action-card:hover {
  box-shadow: var(--shadow);
  border-color: var(--primary-light);
}

.action-card:active {
  transform: scale(0.97);
  box-shadow: none;
}

.action-card:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.action-icon {
  font-size: 2rem;
  line-height: 1;
}

.action-label {
  font-size: clamp(0.7rem, 3.2vw, 0.875rem);
  font-weight: 600;
  color: var(--text);
  line-height: 1.25;
}

@media (min-width: 600px) {
  .action-card {
    padding: 20px 16px;
    align-items: flex-start;
    justify-content: flex-start;
    text-align: left;
    aspect-ratio: unset;
  }

  .action-icon {
    font-size: 1.75rem;
  }

  .action-label {
    font-size: 0.9375rem;
  }
}
</style>
