<template>
  <div class="page">
    <AppHeader :title="t('reports.title')" show-back back-to="/settings" />

    <div class="page-content">
      <!-- Report Type Selection -->
      <section class="section">
        <h2 class="section-label">{{ t('reports.selectReport') }}</h2>
        <div class="report-grid">
          <button
            v-for="report in reportTypes"
            :key="report.key"
            class="report-card"
            :class="{ active: selectedReport === report.key }"
            @click="selectedReport = report.key"
          >
            <span class="report-icon">{{ report.icon }}</span>
            <span class="report-name">{{ t(`reports.types.${report.key}.name`) }}</span>
            <span class="report-desc">{{ t(`reports.types.${report.key}.desc`) }}</span>
          </button>
        </div>
      </section>

      <!-- Date Range -->
      <section class="section">
        <h2 class="section-label">{{ t('reports.dateRange') }}</h2>
        <div class="date-row">
          <div class="form-group">
            <label class="form-label">{{ t('reports.from') }}</label>
            <input v-model="dateFrom" type="date" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">{{ t('reports.to') }}</label>
            <input v-model="dateTo" type="date" class="form-input" />
          </div>
        </div>
      </section>

      <!-- Format Selection -->
      <section class="section">
        <h2 class="section-label">{{ t('reports.format') }}</h2>
        <div class="filter-chips">
          <button
            class="chip"
            :class="{ active: format === 'pdf' }"
            @click="format = 'pdf'"
          >
            PDF
          </button>
          <button
            class="chip"
            :class="{ active: format === 'xlsx' }"
            @click="format = 'xlsx'"
          >
            Excel
          </button>
        </div>
      </section>

      <!-- Generate Button -->
      <button
        class="btn-primary generate-btn"
        :disabled="!canGenerate || generating"
        @click="generate"
      >
        <span v-if="generating" class="spinner" />
        {{ generating ? t('reports.generating') : t('reports.generate') }}
      </button>

      <p v-if="error" class="error-msg">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import api from '../../services/api.js'
import { extractApiError, resolveError } from '../../utils/apiError'

const { t } = useI18n()

const reportTypes = [
  { key: 'withdrawalCompliance', icon: '🛡️', slug: 'withdrawal-compliance' },
  { key: 'treatmentHistory', icon: '💉', slug: 'treatment-history' },
  { key: 'discardedMilk', icon: '🥛', slug: 'discarded-milk' },
  { key: 'medicationUsage', icon: '💊', slug: 'medication-usage' },
  { key: 'milkProduction', icon: '📊', slug: 'milk-production' },
  { key: 'breeding', icon: '🐄', slug: 'breeding' },
  { key: 'herdHealth', icon: '🩺', slug: 'herd-health' },
]

const selectedReport = ref(null)
const dateFrom = ref('')
const dateTo = ref('')
const format = ref('pdf')
const generating = ref(false)
const error = ref('')

const canGenerate = computed(() => selectedReport.value && dateFrom.value && dateTo.value)

async function generate() {
  if (!canGenerate.value) return

  const report = reportTypes.find((r) => r.key === selectedReport.value)
  if (!report) return

  generating.value = true
  error.value = ''

  try {
    const res = await api.get(`/reports/${report.slug}`, {
      params: { from: dateFrom.value, to: dateTo.value, format: format.value },
      responseType: 'blob',
    })

    const ext = format.value === 'xlsx' ? 'xlsx' : 'pdf'
    const filename = `${report.slug}-${dateFrom.value}-to-${dateTo.value}.${ext}`
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    error.value = resolveError(extractApiError(err), t)
  } finally {
    generating.value = false
  }
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

.report-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

@media (min-width: 600px) {
  .report-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.report-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px 16px;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.report-card:hover {
  border-color: var(--primary);
}

.report-card.active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
}

.report-icon {
  font-size: 1.5rem;
  line-height: 1;
}

.report-name {
  font-weight: 600;
  font-size: 0.9375rem;
}

.report-desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.date-row {
  display: flex;
  gap: 12px;
}

.date-row .form-group {
  flex: 1;
}

.form-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-secondary);
}

.generate-btn {
  margin-top: 8px;
}

.generate-btn .spinner {
  width: 16px;
  height: 16px;
  margin-right: 8px;
}

.error-msg {
  color: var(--danger);
  font-size: 0.875rem;
  margin-top: 8px;
}
</style>
