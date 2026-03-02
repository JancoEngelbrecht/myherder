import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFeatureFlagsStore } from '../stores/featureFlags.js'
import { isOfflineError } from '../services/syncManager'
import { useToast } from './useToast'
import { extractApiError, resolveError } from '../utils/apiError'

export const chartColors = {
  primary: '#2D6A4F',
  primaryLight: 'rgba(45, 106, 79, 0.15)',
  danger: '#D62828',
  dangerLight: 'rgba(214, 40, 40, 0.15)',
  warning: '#E07C24',
  warningLight: 'rgba(224, 124, 36, 0.15)',
  info: '#3A86FF',
  infoLight: 'rgba(58, 134, 255, 0.15)',
  purple: '#7C3AED',
  purpleLight: 'rgba(124, 58, 237, 0.15)',
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatMonth(ym) {
  const [y, m] = ym.split('-')
  return `${monthNames[parseInt(m) - 1]} ${y.slice(2)}`
}

const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } },
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(0,0,0,0.06)' },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } },
    },
  },
}

export const lineChartOptions = { ...commonOptions }
export const barChartOptions = { ...commonOptions }
export const horizontalBarOptions = { ...commonOptions, indexAxis: 'y' }

// ── Time Range Filter ───────────────────────────────

export const TIME_RANGE_OPTIONS = [
  { value: 3, labelKey: 'analytics.timeRange.3m' },
  { value: 6, labelKey: 'analytics.timeRange.6m' },
  { value: 12, labelKey: 'analytics.timeRange.12m' },
  { value: 24, labelKey: 'analytics.timeRange.24m' },
]

function pad(n) { return String(n).padStart(2, '0') }

export function useTimeRange(defaultMonths = 12) {
  const selectedRange = ref(defaultMonths)

  const dateRange = computed(() => {
    const now = new Date()
    const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const from = new Date(now)
    from.setMonth(from.getMonth() - selectedRange.value)
    const fromStr = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`
    return { from: fromStr, to }
  })

  return { selectedRange, dateRange, TIME_RANGE_OPTIONS }
}

// ── Chart Annotation Helpers ────────────────────────

/** Horizontal target/concern line annotation (y-axis) */
export function horizontalAnnotation(value, label, color = chartColors.danger, position = 'end') {
  return {
    type: 'line',
    yMin: value,
    yMax: value,
    borderColor: color,
    borderWidth: 2,
    borderDash: [6, 3],
    label: {
      display: true,
      content: label,
      position,
      backgroundColor: color,
      font: { size: 9 },
      padding: 3,
    },
  }
}

/** Vertical target/concern line annotation (x-axis) */
export function verticalAnnotation(value, label, color = chartColors.danger, position = 'end') {
  return {
    type: 'line',
    xMin: value,
    xMax: value,
    borderColor: color,
    borderWidth: 2,
    borderDash: [6, 3],
    label: {
      display: true,
      content: label,
      position,
      backgroundColor: color,
      font: { size: 9 },
      padding: 3,
    },
  }
}

// ── Analytics Composable ────────────────────────────

export function useAnalytics() {
  const offline = ref(false)
  const { t } = useI18n()
  const toast = useToast()
  const flagsStore = useFeatureFlagsStore()
  const flags = computed(() => flagsStore.flags)

  function handleError(err) {
    if (isOfflineError(err)) {
      offline.value = true
    } else {
      toast.show(resolveError(extractApiError(err), t), 'error')
    }
  }

  return { offline, flags, handleError, t }
}
