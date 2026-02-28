<template>
  <div class="page">
    <AppHeader :title="t('settings.title')" show-back back-to="/" />

    <div class="page-content">
      <section v-if="showAdminTools" class="section">
        <h2 class="section-label">{{ t('settings.adminTools') }}</h2>
        <div class="settings-list">
          <RouterLink v-if="flags.treatments" to="/admin/medications" class="settings-item">
            <span class="settings-icon">💊</span>
            <div class="settings-info">
              <span class="settings-name">{{ t('medications.title') }}</span>
              <span class="settings-desc">{{ t('settings.medicationsDesc') }}</span>
            </div>
            <span class="settings-arrow">›</span>
          </RouterLink>

          <RouterLink v-if="flags.healthIssues" to="/admin/issue-types" class="settings-item">
            <span class="settings-icon">🩺</span>
            <div class="settings-info">
              <span class="settings-name">{{ t('issueTypes.title') }}</span>
              <span class="settings-desc">{{ t('settings.issueTypesDesc') }}</span>
            </div>
            <span class="settings-arrow">›</span>
          </RouterLink>

          <RouterLink v-if="flags.breeding" to="/admin/breed-types" class="settings-item">
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
        <h2 class="section-label">{{ t('featureFlags.sectionTitle') }}</h2>
        <p class="section-desc">{{ t('featureFlags.sectionDesc') }}</p>
        <div class="settings-list">
          <div v-for="flag in moduleFlags" :key="flag.key" class="settings-item">
            <div class="settings-info">
              <span class="settings-name">{{ t(`featureFlags.${flag.key}.name`) }}</span>
              <span class="settings-desc">{{ t(`featureFlags.${flag.key}.desc`) }}</span>
            </div>
            <label class="toggle-switch">
              <input
                type="checkbox"
                :checked="flags[flag.key]"
                :disabled="flag.updating"
                @change="toggleFlag(flag, $event)"
              />
              <span class="toggle-slider" />
            </label>
          </div>
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
import { ref, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import { initialSync, lastSyncTime as syncLastTime } from '../../services/syncManager.js'
import { useFeatureFlagsStore } from '../../stores/featureFlags.js'

const { t } = useI18n()
const featureFlagsStore = useFeatureFlagsStore()
const syncing = ref(false)

const flags = computed(() => featureFlagsStore.flags)

const moduleFlags = reactive([
  { key: 'breeding', updating: false },
  { key: 'milkRecording', updating: false },
  { key: 'healthIssues', updating: false },
  { key: 'treatments', updating: false },
  { key: 'analytics', updating: false },
])

const showAdminTools = computed(() =>
  flags.value.treatments || flags.value.healthIssues || flags.value.breeding,
)

async function toggleFlag(flag, event) {
  const enabled = event.target.checked
  flag.updating = true
  try {
    await featureFlagsStore.updateFlag(flag.key, enabled)
  } catch {
    // Reverted by the store — checkbox will reflect the correct state
  } finally {
    flag.updating = false
  }
}

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

.section-desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: 12px;
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
