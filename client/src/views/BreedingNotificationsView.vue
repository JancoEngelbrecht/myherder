<template>
  <div class="page">
    <AppHeader :title="t('breeding.notificationsTitle')" show-back back-to="/breed" />

    <div class="page-content">
      <!-- Filter chips -->
      <div class="filter-chips">
        <button
          v-for="f in filters"
          :key="f.value"
          class="chip"
          :class="{ active: activeFilter === f.value }"
          @click="activeFilter = f.value"
        >
          {{ f.label }}
          <span v-if="f.count > 0" class="chip-count">{{ f.count }}</span>
        </button>
      </div>

      <!-- Time filter chips -->
      <div class="filter-chips">
        <button
          v-for="tf in timeFilters"
          :key="tf.value"
          class="chip chip-time"
          :class="{ active: activeTimeFilter === tf.value }"
          @click="activeTimeFilter = tf.value"
        >
          {{ tf.label }}
          <span v-if="tf.count > 0" class="chip-count">{{ tf.count }}</span>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="breedingStore.loading" class="empty-state">
        <span class="spinner" />
        <p>{{ t('common.loading') }}</p>
      </div>

      <!-- "All" grouped view -->
      <template v-else-if="activeFilter === 'all'">
        <!-- Needs Attention -->
        <section v-if="timeFilteredAttention.length" class="section attention-section">
          <div class="attention-header">
            <h3 class="group-label attention-label">{{ t('breeding.needsAttention') }}</h3>
            <button class="btn-secondary btn-sm-dismiss" @click="openDismissAll">
              {{ t('breeding.dismissAll') }}
            </button>
          </div>
          <div
            v-for="item in timeFilteredAttention"
            :key="`${item.id}-${item.alert_type}`"
            class="attention-row card"
            @click="goToRepro(item.animal_id)"
          >
            <div class="attention-top">
              <span class="alert-cow mono">{{ item.tag_number }}</span>
              <span v-if="item.cow_name" class="alert-name">{{ item.cow_name }}</span>
              <span class="alert-badge overdue">{{ overdueLabel(item.alert_type) }}</span>
            </div>
            <button class="btn-secondary btn-sm-dismiss" @click.stop="openDismiss(item)">
              {{ t('breeding.dismiss') }}
            </button>
          </div>
        </section>

        <!-- Upcoming heats -->
        <section v-if="timeFilteredHeats.length" class="section">
          <div class="alert-group">
            <h3 class="group-label">
              <AppIcon name="flame" :size="13" /> {{ t('breeding.upcoming.heats') }}
            </h3>
            <div
              v-for="ev in visibleHeats"
              :key="ev.id"
              class="alert-row card"
              @click="goToRepro(ev.animal_id)"
            >
              <span class="alert-cow mono">{{ ev.tag_number }}</span>
              <span v-if="ev.cow_name" class="alert-name">{{ ev.cow_name }}</span>
              <span class="spacer" />
              <span class="alert-badge heat">{{ alertLabel(ev.expected_next_heat) }}</span>
            </div>
            <button
              v-if="timeFilteredHeats.length > ALERT_PREVIEW"
              class="show-more-btn"
              @click="showAll.heats = !showAll.heats"
            >
              {{
                showAll.heats
                  ? t('breeding.showLess')
                  : t('breeding.showAll', { count: timeFilteredHeats.length })
              }}
            </button>
          </div>
        </section>

        <!-- Upcoming calvings -->
        <section v-if="timeFilteredCalvings.length" class="section">
          <div class="alert-group">
            <h3 class="group-label">
              <AppIcon name="baby" :size="13" /> {{ t('breeding.upcoming.calvings') }}
            </h3>
            <div
              v-for="ev in visibleCalvings"
              :key="ev.id"
              class="alert-row card"
              @click="goToRepro(ev.animal_id)"
            >
              <span class="alert-cow mono">{{ ev.tag_number }}</span>
              <span v-if="ev.cow_name" class="alert-name">{{ ev.cow_name }}</span>
              <span class="spacer" />
              <span class="alert-badge calving">{{ alertLabel(ev.expected_calving) }}</span>
            </div>
            <button
              v-if="timeFilteredCalvings.length > ALERT_PREVIEW"
              class="show-more-btn"
              @click="showAll.calvings = !showAll.calvings"
            >
              {{
                showAll.calvings
                  ? t('breeding.showLess')
                  : t('breeding.showAll', { count: timeFilteredCalvings.length })
              }}
            </button>
          </div>
        </section>

        <!-- Upcoming preg checks -->
        <section v-if="timeFilteredPregChecks.length" class="section">
          <div class="alert-group">
            <h3 class="group-label">
              <AppIcon name="stethoscope" :size="13" /> {{ t('breeding.upcoming.pregChecks') }}
            </h3>
            <div
              v-for="ev in visiblePregChecks"
              :key="ev.id"
              class="alert-row card"
              @click="goToRepro(ev.animal_id)"
            >
              <span class="alert-cow mono">{{ ev.tag_number }}</span>
              <span v-if="ev.cow_name" class="alert-name">{{ ev.cow_name }}</span>
              <span class="spacer" />
              <span class="alert-badge check">{{ alertLabel(ev.expected_preg_check) }}</span>
            </div>
            <button
              v-if="timeFilteredPregChecks.length > ALERT_PREVIEW"
              class="show-more-btn"
              @click="showAll.pregChecks = !showAll.pregChecks"
            >
              {{
                showAll.pregChecks
                  ? t('breeding.showLess')
                  : t('breeding.showAll', { count: timeFilteredPregChecks.length })
              }}
            </button>
          </div>
        </section>

        <!-- Upcoming dry-offs -->
        <section v-if="timeFilteredDryOffs.length" class="section">
          <div class="alert-group">
            <h3 class="group-label">
              <AppIcon name="leaf" :size="13" /> {{ t('breeding.upcoming.dryOffs') }}
            </h3>
            <div v-for="ev in visibleDryOffs" :key="ev.id" class="card dryoff-card">
              <div class="alert-row" @click="goToRepro(ev.animal_id)">
                <span class="alert-cow mono">{{ ev.tag_number }}</span>
                <span v-if="ev.cow_name" class="alert-name">{{ ev.cow_name }}</span>
                <span class="spacer" />
                <span class="alert-badge dryoff">{{ alertLabel(ev.expected_dry_off) }}</span>
              </div>
              <div class="dryoff-actions">
                <button class="btn-primary btn-sm-action" @click="acceptDryOff(ev)">
                  {{ t('breeding.dryOff.accept') }}
                </button>
                <button class="btn-secondary btn-sm-action" @click="openDismiss(ev)">
                  {{ t('breeding.dryOff.reject') }}
                </button>
              </div>
            </div>
            <button
              v-if="timeFilteredDryOffs.length > ALERT_PREVIEW"
              class="show-more-btn"
              @click="showAll.dryOffs = !showAll.dryOffs"
            >
              {{
                showAll.dryOffs
                  ? t('breeding.showLess')
                  : t('breeding.showAll', { count: timeFilteredDryOffs.length })
              }}
            </button>
          </div>
        </section>

        <!-- Empty -->
        <div v-if="filteredTotalCount === 0" class="empty-state">
          <p>{{ t('breeding.noNotifications') }}</p>
        </div>
      </template>

      <!-- Category filter — flat list -->
      <template v-else>
        <section v-if="filteredItems.length" class="section">
          <div
            v-for="item in filteredItems"
            :key="item.id"
            :class="item._isDryOff ? 'card dryoff-card' : 'alert-row card'"
          >
            <!-- Dry-off card layout -->
            <template v-if="item._isDryOff">
              <div class="alert-row" @click="goToRepro(item.animal_id)">
                <span class="alert-cow mono">{{ item.tag_number }}</span>
                <span v-if="item.cow_name" class="alert-name">{{ item.cow_name }}</span>
                <span class="spacer" />
                <span class="alert-badge" :class="item._badgeClass">{{ item._label }}</span>
              </div>
              <div class="dryoff-actions">
                <button class="btn-primary btn-sm-action" @click="acceptDryOff(item)">
                  {{ t('breeding.dryOff.accept') }}
                </button>
                <button class="btn-secondary btn-sm-action" @click="openDismiss(item)">
                  {{ t('breeding.dryOff.reject') }}
                </button>
              </div>
            </template>

            <!-- Standard alert row -->
            <template v-else>
              <div class="alert-row-inner" @click="goToRepro(item.animal_id)">
                <span class="alert-cow mono">{{ item.tag_number }}</span>
                <span v-if="item.cow_name" class="alert-name">{{ item.cow_name }}</span>
                <span class="spacer" />
                <span class="alert-badge" :class="item._badgeClass">{{ item._label }}</span>
              </div>
              <button
                v-if="item._isOverdue"
                class="btn-secondary btn-sm-dismiss"
                @click.stop="openDismiss(item)"
              >
                {{ t('breeding.dismiss') }}
              </button>
            </template>
          </div>
        </section>

        <div v-else class="empty-state">
          <p>{{ t('breeding.noNotifications') }}</p>
        </div>
      </template>
    </div>

    <!-- Dismiss single dialog -->
    <ConfirmDialog
      :show="!!dismissTarget"
      :message="t('breeding.dismissConfirm')"
      :confirm-label="t('breeding.dismiss')"
      :cancel-label="t('common.cancel')"
      :loading="dismissing"
      @confirm="doDismiss"
      @cancel="dismissTarget = null"
    />

    <!-- Dismiss all dialog -->
    <ConfirmDialog
      :show="showDismissAll"
      :message="t('breeding.dismissAllConfirm', { count: dismissAllIds.length })"
      :confirm-label="t('breeding.dismissAll')"
      :cancel-label="t('common.cancel')"
      :loading="dismissingAll"
      @confirm="doDismissAll"
      @cancel="showDismissAll = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppHeader from '../components/organisms/AppHeader.vue'
import AppIcon from '../components/atoms/AppIcon.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { useToast } from '../composables/useToast'
import { extractApiError, resolveError } from '../utils/apiError'
import { isOfflineError } from '../services/syncManager'

const { t } = useI18n()
const router = useRouter()
const breedingStore = useBreedingEventsStore()
const toast = useToast()

// ── Filter state ─────────────────────────────────────────────────────────────
const activeFilter = ref('all')
const activeTimeFilter = ref('anytime')

const ALERT_PREVIEW = 5
const showAll = reactive({ heats: false, calvings: false, pregChecks: false, dryOffs: false })

// ── Time filter helper ───────────────────────────────────────────────────────
const attentionDateField = {
  heat: 'expected_next_heat',
  preg_check: 'expected_preg_check',
  calving: 'expected_calving',
  dry_off: 'expected_dry_off',
}

function matchesTimeRange(dateStr, range) {
  if (range === 'anytime') return true
  if (!dateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  switch (range) {
    case 'today':
      return diff <= 0
    case 'tomorrow':
      return diff === 1
    case 'week':
      return diff >= 0 && diff <= 7
    case 'nextWeek':
      return diff >= 0 && diff <= 14
    default:
      return true
  }
}

function isInTimeRange(dateStr) {
  return matchesTimeRange(dateStr, activeTimeFilter.value)
}

// ── Time-filtered lists ─────────────────────────────────────────────────────
const timeFilteredAttention = computed(() =>
  breedingStore.upcoming.needsAttention.filter((i) =>
    isInTimeRange(i[attentionDateField[i.alert_type]])
  )
)
const timeFilteredHeats = computed(() =>
  breedingStore.upcoming.heats.filter((i) => isInTimeRange(i.expected_next_heat))
)
const timeFilteredCalvings = computed(() =>
  breedingStore.upcoming.calvings.filter((i) => isInTimeRange(i.expected_calving))
)
const timeFilteredPregChecks = computed(() =>
  breedingStore.upcoming.pregChecks.filter((i) => isInTimeRange(i.expected_preg_check))
)
const timeFilteredDryOffs = computed(() =>
  breedingStore.upcoming.dryOffs.filter((i) => isInTimeRange(i.expected_dry_off))
)

// ── Counts (reflect active time filter) ─────────────────────────────────────
function countOverdueByType(alertType) {
  return timeFilteredAttention.value.filter((i) => i.alert_type === alertType).length
}

const heatsCount = computed(() => timeFilteredHeats.value.length + countOverdueByType('heat'))
const calvingsCount = computed(
  () => timeFilteredCalvings.value.length + countOverdueByType('calving')
)
const pregChecksCount = computed(
  () => timeFilteredPregChecks.value.length + countOverdueByType('preg_check')
)
const dryOffsCount = computed(
  () => timeFilteredDryOffs.value.length + countOverdueByType('dry_off')
)
const totalCount = computed(
  () =>
    timeFilteredAttention.value.length +
    timeFilteredHeats.value.length +
    timeFilteredCalvings.value.length +
    timeFilteredPregChecks.value.length +
    timeFilteredDryOffs.value.length
)
const filteredTotalCount = totalCount

const filters = computed(() => [
  { value: 'all', label: t('breeding.filterAll'), count: totalCount.value },
  { value: 'heats', label: t('breeding.filterHeats'), count: heatsCount.value },
  { value: 'calvings', label: t('breeding.filterCalvings'), count: calvingsCount.value },
  { value: 'pregChecks', label: t('breeding.filterPregChecks'), count: pregChecksCount.value },
  { value: 'dryOffs', label: t('breeding.filterDryOffs'), count: dryOffsCount.value },
])

function countForTimeRange(range) {
  const u = breedingStore.upcoming
  const att = u.needsAttention.filter((i) =>
    matchesTimeRange(i[attentionDateField[i.alert_type]], range)
  ).length
  const h = u.heats.filter((i) => matchesTimeRange(i.expected_next_heat, range)).length
  const c = u.calvings.filter((i) => matchesTimeRange(i.expected_calving, range)).length
  const p = u.pregChecks.filter((i) => matchesTimeRange(i.expected_preg_check, range)).length
  const d = u.dryOffs.filter((i) => matchesTimeRange(i.expected_dry_off, range)).length
  return att + h + c + p + d
}

const timeFilters = computed(() => [
  { value: 'anytime', label: t('breeding.filterAnytime') },
  { value: 'today', label: t('breeding.filterToday'), count: countForTimeRange('today') },
  { value: 'tomorrow', label: t('breeding.filterTomorrow'), count: countForTimeRange('tomorrow') },
  { value: 'week', label: t('breeding.filterThisWeek'), count: countForTimeRange('week') },
  { value: 'nextWeek', label: t('breeding.filterNextWeek'), count: countForTimeRange('nextWeek') },
])

// ── Visible items (All view — sliced) ────────────────────────────────────────
const visibleHeats = computed(() =>
  showAll.heats ? timeFilteredHeats.value : timeFilteredHeats.value.slice(0, ALERT_PREVIEW)
)
const visibleCalvings = computed(() =>
  showAll.calvings ? timeFilteredCalvings.value : timeFilteredCalvings.value.slice(0, ALERT_PREVIEW)
)
const visiblePregChecks = computed(() =>
  showAll.pregChecks
    ? timeFilteredPregChecks.value
    : timeFilteredPregChecks.value.slice(0, ALERT_PREVIEW)
)
const visibleDryOffs = computed(() =>
  showAll.dryOffs ? timeFilteredDryOffs.value : timeFilteredDryOffs.value.slice(0, ALERT_PREVIEW)
)

// ── Category filter — flat list ──────────────────────────────────────────────
const categoryConfig = {
  heats: {
    dateField: 'expected_next_heat',
    alertType: 'heat',
    badgeClass: 'heat',
    isDryOff: false,
  },
  calvings: {
    dateField: 'expected_calving',
    alertType: 'calving',
    badgeClass: 'calving',
    isDryOff: false,
  },
  pregChecks: {
    dateField: 'expected_preg_check',
    alertType: 'preg_check',
    badgeClass: 'check',
    isDryOff: false,
  },
  dryOffs: {
    dateField: 'expected_dry_off',
    alertType: 'dry_off',
    badgeClass: 'dryoff',
    isDryOff: true,
  },
}

const filteredItems = computed(() => {
  const cfg = categoryConfig[activeFilter.value]
  if (!cfg) return []

  const overdue = breedingStore.upcoming.needsAttention
    .filter(
      (i) => i.alert_type === cfg.alertType && isInTimeRange(i[attentionDateField[i.alert_type]])
    )
    .map((i) => ({
      ...i,
      _isOverdue: true,
      _badgeClass: 'overdue',
      _label: overdueLabel(i.alert_type),
      _isDryOff: cfg.isDryOff,
    }))

  const upcoming = breedingStore.upcoming[activeFilter.value]
    .filter((i) => isInTimeRange(i[cfg.dateField]))
    .map((i) => ({
      ...i,
      _isOverdue: false,
      _badgeClass: cfg.badgeClass,
      _label: alertLabel(i[cfg.dateField]),
      _isDryOff: cfg.isDryOff,
    }))
    .sort((a, b) => (a[cfg.dateField] || '').localeCompare(b[cfg.dateField] || ''))

  return [...overdue, ...upcoming]
})

// ── Label helpers ────────────────────────────────────────────────────────────
const overdueLabels = {
  heat: 'breeding.alert.overdueHeat',
  preg_check: 'breeding.alert.overduePregCheck',
  calving: 'breeding.alert.overdueCalving',
  dry_off: 'breeding.alert.overdueDryOff',
}

function overdueLabel(alertType) {
  return t(overdueLabels[alertType] || 'breeding.alert.overdue')
}

function alertLabel(dateStr) {
  if (!dateStr) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff === 0) return t('breeding.alert.today')
  if (diff < 0) return t('breeding.alert.overdue')
  return `${diff}d`
}

// ── Actions ──────────────────────────────────────────────────────────────────
const dismissTarget = ref(null)
const dismissing = ref(false)
const showDismissAll = ref(false)
const dismissingAll = ref(false)
const dismissAllIds = ref([])

function goToRepro(cowId) {
  router.push(`/animals/${cowId}/repro`)
}

function openDismiss(item) {
  dismissTarget.value = item
}

async function doDismiss() {
  dismissing.value = true
  try {
    await breedingStore.dismissEvent(dismissTarget.value.id)
  } catch (err) {
    if (!isOfflineError(err)) toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    dismissing.value = false
    dismissTarget.value = null
  }
}

function openDismissAll() {
  dismissAllIds.value = timeFilteredAttention.value.map((i) => i.id)
  showDismissAll.value = true
}

async function doDismissAll() {
  dismissingAll.value = true
  try {
    await breedingStore.dismissBatch(dismissAllIds.value)
    await breedingStore.fetchUpcoming()
  } catch (err) {
    if (!isOfflineError(err)) toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    dismissingAll.value = false
    showDismissAll.value = false
    dismissAllIds.value = []
  }
}

async function acceptDryOff(ev) {
  try {
    await breedingStore.createEvent({
      animal_id: ev.animal_id,
      event_type: 'dry_off',
      event_date: new Date().toISOString().slice(0, 16),
    })
    await breedingStore.fetchUpcoming()
  } catch (err) {
    if (!isOfflineError(err)) toast.show(resolveError(extractApiError(err), t), 'error')
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  breedingStore.fetchUpcoming()
})
</script>

<style scoped>
.page-content {
  padding: calc(var(--header-height) + 1rem) 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

/* ── View-specific chip variants ── */
.chip-time {
  border-style: dashed;
}

.chip-time.active {
  border-style: solid;
}

/* ── Alert groups ── */
.alert-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.group-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.alert-row,
.alert-row-inner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.6rem;
  padding: 0.65rem 0.85rem;
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.alert-row:active,
.alert-row-inner:active {
  box-shadow: 0 0 0 2px var(--primary);
}

.alert-cow {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--primary);
}

.alert-name {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.spacer {
  flex: 1;
}

.alert-badge {
  font-size: 0.75rem;
  font-weight: 700;
  font-family: var(--font-mono);
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
}

.alert-badge.heat {
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  color: var(--warning);
}

.alert-badge.calving {
  background: color-mix(in srgb, #7b5ea7 12%, transparent);
  color: #7b5ea7;
}

.alert-badge.check {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
}

.alert-badge.overdue {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.alert-badge.dryoff {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
}

/* ── Attention section ── */
.attention-section {
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  border-radius: var(--radius);
  padding: 0.75rem;
}

.attention-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.attention-label {
  color: var(--danger);
}

.attention-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  background: var(--surface);
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.attention-row:active {
  box-shadow: 0 0 0 2px var(--primary);
}

.attention-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.btn-sm-dismiss {
  font-size: 0.72rem;
  padding: 4px 10px;
  width: auto;
  flex-shrink: 0;
}

/* ── Dry-off cards ── */
.dryoff-card {
  padding: 0;
  overflow: hidden;
}

.dryoff-card .alert-row {
  padding: 0.65rem 0.85rem;
  cursor: pointer;
}

.dryoff-actions {
  display: flex;
  gap: 0;
  border-top: 1px solid var(--border);
}

.btn-sm-action {
  flex: 1;
  font-size: 0.78rem;
  padding: 8px;
  border-radius: 0;
  width: auto;
}

.dryoff-actions .btn-sm-action:first-child {
  border-radius: 0 0 0 var(--radius);
}

.dryoff-actions .btn-sm-action:last-child {
  border-radius: 0 0 var(--radius) 0;
}

/* ── Show more ── */
.show-more-btn {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 0;
  text-align: left;
}

.show-more-btn:hover {
  text-decoration: underline;
}
</style>
