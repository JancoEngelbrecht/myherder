<template>
  <div class="page">
    <AppHeader :title="t('settings.title')" show-back back-to="/" />

    <div class="page-content">
      <section class="section">
        <h2 class="section-label">{{ t('settings.adminTools') }}</h2>
        <div class="settings-list">
          <RouterLink to="/admin/users" class="settings-item">
            <span class="settings-icon">👥</span>
            <div class="settings-info">
              <span class="settings-name">{{ t('users.title') }}</span>
              <span class="settings-desc">{{ t('settings.usersDesc') }}</span>
            </div>
            <span class="settings-arrow">›</span>
          </RouterLink>

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

          <RouterLink to="/admin/audit-log" class="settings-item">
            <span class="settings-icon">📋</span>
            <div class="settings-info">
              <span class="settings-name">{{ t('audit.title') }}</span>
              <span class="settings-desc">{{ t('settings.auditLogDesc') }}</span>
            </div>
            <span class="settings-arrow">›</span>
          </RouterLink>

          <RouterLink to="/admin/reports" class="settings-item">
            <span class="settings-icon">📄</span>
            <div class="settings-info">
              <span class="settings-name">{{ t('reports.title') }}</span>
              <span class="settings-desc">{{ t('settings.reportsDesc') }}</span>
            </div>
            <span class="settings-arrow">›</span>
          </RouterLink>
        </div>
      </section>

      <section class="section">
        <h2 class="section-label">{{ t('settings.appSettings') }}</h2>
        <div class="settings-list">
          <div class="settings-item app-setting-row">
            <div class="settings-info">
              <label for="farm-name" class="settings-name">{{ t('settings.farmName') }}</label>
              <span class="settings-desc">{{ t('settings.farmNameDesc') }}</span>
            </div>
            <input
              id="farm-name"
              v-model="farmName"
              class="form-input inline-input"
              maxlength="100"
              :placeholder="t('settings.farmNamePlaceholder')"
              @blur="saveAppSettings"
            />
          </div>
          <div class="settings-item app-setting-row">
            <div class="settings-info">
              <label for="default-lang" class="settings-name">{{ t('settings.defaultLanguage') }}</label>
              <span class="settings-desc">{{ t('settings.defaultLanguageDesc') }}</span>
            </div>
            <select id="default-lang" v-model="defaultLang" class="form-input inline-input" @change="saveAppSettings">
              <option value="en">English</option>
              <option value="af">Afrikaans</option>
            </select>
          </div>
          <div class="settings-item app-setting-row">
            <div class="settings-info">
              <label for="milk-price" class="settings-name">{{ t('settings.milkPrice') }}</label>
              <span class="settings-desc">{{ t('settings.milkPriceDesc') }}</span>
            </div>
            <input
              id="milk-price"
              v-model="milkPrice"
              type="number"
              step="0.01"
              min="0"
              class="form-input inline-input"
              placeholder="0.00"
              @blur="saveAppSettings"
            />
          </div>
        </div>
        <p v-if="settingsSaved" class="saved-feedback">{{ t('settings.appSettingsSaved') }}</p>
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
        <h2 class="section-label">{{ t('settings.dataSection') }}</h2>
        <div class="settings-list">
          <button class="settings-item" :disabled="exporting" @click="exportData">
            <span class="settings-icon">{{ exporting ? '...' : '📦' }}</span>
            <div class="settings-info">
              <span class="settings-name">{{ t('settings.exportData') }}</span>
              <span class="settings-desc">{{ t('settings.exportDataDesc') }}</span>
            </div>
          </button>
        </div>
      </section>

      <section class="section">
        <h2 class="section-label">{{ t('settings.dataSync') }}</h2>
        <div class="settings-list">
          <button class="settings-item" :disabled="syncing" @click="forceSync">
            <span class="settings-icon">{{ syncing ? '⏳' : '🔄' }}</span>
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
import { ref, computed, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import { initialSync, lastSyncTime as syncLastTime } from '../../services/syncManager.js'
import { useFeatureFlagsStore } from '../../stores/featureFlags.js'
import api from '../../services/api.js'

const { t } = useI18n()
const featureFlagsStore = useFeatureFlagsStore()
const syncing = ref(false)

// Data export
const exporting = ref(false)

async function exportData() {
  exporting.value = true
  try {
    const { data } = await api.get('/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `myherder-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // error handled by api interceptor
  } finally {
    exporting.value = false
  }
}

// App settings
const farmName = ref('')
const defaultLang = ref('en')
const milkPrice = ref('')
const settingsSaved = ref(false)
let saveTimeout = null

onMounted(async () => {
  try {
    const { data } = await api.get('/settings')
    farmName.value = data.farm_name || ''
    defaultLang.value = data.default_language || 'en'
    milkPrice.value = data.milk_price_per_litre || ''
  } catch {
    // silently ignore — settings are optional
  }
})

async function saveAppSettings() {
  try {
    const payload = {
      farm_name: farmName.value,
      default_language: defaultLang.value,
    }
    if (milkPrice.value !== '') {
      payload.milk_price_per_litre = String(milkPrice.value)
    }
    await api.patch('/settings', payload)
    settingsSaved.value = true
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => { settingsSaved.value = false }, 2000)
  } catch {
    // error handled by api interceptor
  }
}

const flags = computed(() => featureFlagsStore.flags)

const moduleFlags = reactive([
  { key: 'breeding', updating: false },
  { key: 'milkRecording', updating: false },
  { key: 'healthIssues', updating: false },
  { key: 'treatments', updating: false },
  { key: 'analytics', updating: false },
])

// Admin tools section always shows (users link is always visible)
// Feature-flagged tools use v-if in the template

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

.app-setting-row {
  flex-wrap: wrap;
}

.inline-input {
  width: 180px;
  flex-shrink: 0;
  font-size: 0.875rem;
  padding: 8px 10px;
}

.saved-feedback {
  font-size: 0.8rem;
  color: var(--primary);
  margin-top: 8px;
  font-weight: 500;
}
</style>
