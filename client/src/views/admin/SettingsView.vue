<template>
  <div class="page">
    <AppHeader :title="t('settings.title')" show-back back-to="/" />

    <div class="page-content">
      <section class="section">
        <h2 class="section-label">{{ t('settings.adminTools') }}</h2>
        <div class="settings-list">
          <RouterLink to="/admin/medications" class="settings-item">
            <span class="settings-icon">💊</span>
            <div class="settings-info">
              <span class="settings-name">{{ t('medications.title') }}</span>
              <span class="settings-desc">{{ t('settings.medicationsDesc') }}</span>
            </div>
            <span class="settings-arrow">›</span>
          </RouterLink>

          <RouterLink to="/admin/issue-types" class="settings-item">
            <span class="settings-icon">🩺</span>
            <div class="settings-info">
              <span class="settings-name">{{ t('issueTypes.title') }}</span>
              <span class="settings-desc">{{ t('settings.issueTypesDesc') }}</span>
            </div>
            <span class="settings-arrow">›</span>
          </RouterLink>

          <RouterLink to="/admin/breed-types" class="settings-item">
            <span class="settings-icon">🐄</span>
            <div class="settings-info">
              <span class="settings-name">{{ t('breedTypes.title') }}</span>
              <span class="settings-desc">{{ t('settings.breedTypesDesc') }}</span>
            </div>
            <span class="settings-arrow">›</span>
          </RouterLink>
        </div>
      </section>

      <section class="section">
        <h2 class="section-label">{{ t('settings.dataSync') }}</h2>
        <div class="settings-list">
          <button class="settings-item" :disabled="syncing" @click="forceSync">
            <span class="settings-icon">{{ syncing ? '' : '' }}</span>
            <div class="settings-info">
              <span class="settings-name">{{ t('settings.forceSync') }}</span>
              <span class="settings-desc">
                {{ syncing ? t('settings.syncingNow') : t('settings.forceSyncDesc') }}
              </span>
              <span v-if="syncLastTime" class="settings-desc">
                {{ t('settings.lastSync') }}: {{ formatSyncTime(syncLastTime) }}
              </span>
            </div>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import { initialSync, lastSyncTime as syncLastTime } from '../../services/syncManager.js'

const { t } = useI18n()
const syncing = ref(false)

async function forceSync() {
  syncing.value = true
  try {
    await initialSync(true)
  } finally {
    syncing.value = false
  }
}

function formatSyncTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString()
}
</script>

<style scoped>
.section {
  margin-bottom: 24px;
}

.section-label {
  margin-bottom: 12px;
  display: block;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.settings-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--surface);
  text-decoration: none;
  color: var(--text);
  transition: background 0.15s;
}

.settings-item:active {
  background: var(--surface-2);
}

.settings-icon {
  font-size: 1.5rem;
  line-height: 1;
  flex-shrink: 0;
}

.settings-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-name {
  font-size: 0.9375rem;
  font-weight: 600;
}

.settings-desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.settings-arrow {
  font-size: 1.25rem;
  color: var(--text-secondary);
  line-height: 1;
}
</style>
