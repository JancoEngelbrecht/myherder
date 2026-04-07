<template>
  <div class="page">
    <AppHeader :title="t('superAdmin.speciesManagement')" show-back back-to="/super/defaults" />

    <div class="page-content">
      <div v-if="loading" class="empty-state"><span class="spinner" /></div>

      <template v-else>
        <div v-for="sp in species" :key="sp.id" class="card species-card">
          <div class="species-header">
            <div class="species-title">
              <span class="species-emoji">{{ sp.config?.emoji?.female || '🐄' }}</span>
              <h2 class="species-name">{{ sp.name }}</h2>
              <span class="mono species-code">{{ sp.code }}</span>
            </div>
            <span :class="['badge', sp.is_active ? 'badge-active' : 'badge-inactive']">
              {{ sp.is_active ? t('superAdmin.active') : t('superAdmin.inactive') }}
            </span>
          </div>

          <!-- Terminology -->
          <div class="species-section">
            <h3 class="section-title">{{ t('superAdmin.speciesTerminology') }}</h3>
            <div class="term-grid">
              <div v-for="(val, key) in sp.config?.terminology" :key="key" class="term-row">
                <span class="term-key">{{ key }}</span>
                <span class="term-val">{{ val }}</span>
              </div>
            </div>
          </div>

          <!-- Life phases -->
          <div class="species-section">
            <h3 class="section-title">{{ t('superAdmin.speciesLifePhases') }}</h3>
            <div class="phases-grid">
              <div class="phase-col">
                <h4 class="phase-sex">{{ t('sex.female') }}</h4>
                <div
                  v-for="phase in sp.config?.life_phases?.female"
                  :key="phase.code"
                  class="phase-row"
                >
                  <span class="mono phase-code">{{ phase.code }}</span>
                  <span class="phase-range">
                    <template v-if="phase.maxMonths">≤ {{ phase.maxMonths }}mo</template>
                    <template v-else-if="phase.minMonths">≥ {{ phase.minMonths }}mo</template>
                  </span>
                </div>
              </div>
              <div class="phase-col">
                <h4 class="phase-sex">{{ t('sex.male') }}</h4>
                <div
                  v-for="phase in sp.config?.life_phases?.male"
                  :key="phase.code"
                  class="phase-row"
                >
                  <span class="mono phase-code">{{ phase.code }}</span>
                  <span class="phase-range">
                    <template v-if="phase.maxMonths">≤ {{ phase.maxMonths }}mo</template>
                    <template v-else-if="phase.minMonths">≥ {{ phase.minMonths }}mo</template>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Event types -->
          <div class="species-section">
            <h3 class="section-title">{{ t('superAdmin.speciesEventTypes') }}</h3>
            <div class="event-chips">
              <span v-for="evt in sp.config?.event_types" :key="evt" class="mono event-chip">{{
                evt
              }}</span>
            </div>
          </div>

          <!-- Birth info -->
          <div class="species-section">
            <div class="birth-stats">
              <div class="birth-stat">
                <span class="stat-label">{{ t('superAdmin.typicalMultipleBirths') }}</span>
                <span class="mono stat-val">{{ sp.config?.typical_multiple_births ?? 1 }}</span>
              </div>
              <div class="birth-stat">
                <span class="stat-label">{{ t('superAdmin.maxOffspring') }}</span>
                <span class="mono stat-val">{{ sp.config?.max_offspring ?? 1 }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!species.length" class="empty-state">
          <p>{{ t('superAdmin.noSpecies') }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api'
import AppHeader from '../../components/organisms/AppHeader.vue'
import { extractApiError, resolveError } from '../../utils/apiError'
import { useToast } from '../../composables/useToast'

const { t } = useI18n()
const { showToast } = useToast()

const species = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const { data } = await api.get('/species')
    species.value = data.map((sp) => {
      let config = sp.config
      if (typeof config === 'string') {
        try {
          config = JSON.parse(config)
        } catch {
          config = {}
        }
      }
      return { ...sp, config: config ?? {} }
    })
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.species-card {
  padding: 16px;
  margin-bottom: 16px;
}

.species-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.species-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.species-emoji {
  font-size: 1.5rem;
}

.species-name {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0;
}

.species-code {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.species-section {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.species-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.term-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.term-row {
  display: flex;
  gap: 8px;
  font-size: 0.8125rem;
}

.term-key {
  color: var(--text-muted);
  min-width: 130px;
  flex-shrink: 0;
}

.term-val {
  font-weight: 500;
}

.phases-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.phase-sex {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary);
  margin: 0 0 6px;
  text-transform: uppercase;
}

.phase-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 0.8125rem;
  border-bottom: 1px solid var(--border);
}

.phase-row:last-child {
  border-bottom: none;
}

.phase-code {
  font-size: 0.75rem;
}

.phase-range {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.event-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.event-chip {
  padding: 3px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.6875rem;
  color: var(--text-secondary);
}

.birth-stats {
  display: flex;
  gap: 24px;
}

.birth-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.stat-val {
  font-size: 1rem;
  font-weight: 700;
}

.badge-active {
  background: var(--success-light);
  color: var(--primary-dark);
}

.badge-inactive {
  background: var(--danger-light);
  color: var(--danger);
}
</style>
