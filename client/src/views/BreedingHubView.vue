<template>
  <div class="page">
    <AppHeader :title="t('breeding.hubTitle')" show-back back-to="/" />

    <div class="page-content">
      <!-- Fetch error banner -->
      <div v-if="breedingStore.error && !breedingStore.loading" class="fetch-error-banner">
        {{ resolveError(breedingStore.error, t) }}
      </div>

      <!-- Needs Attention -->
      <section v-if="breedingStore.upcoming.needsAttention.length" class="section attention-section">
        <h3 class="group-label attention-label">{{ t('breeding.needsAttention') }}</h3>
        <div
          v-for="item in breedingStore.upcoming.needsAttention"
          :key="`${item.id}-${item.alert_type}`"
          class="attention-row card"
          @click="goToRepro(item.cow_id)"
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

      <!-- Stats row -->
      <section class="section">
        <div class="stats-row">
          <div class="stat-pill stat-pregnant">
            <span class="stat-num">{{ pregnantCount }}</span>
            <span class="stat-lbl">{{ t('breeding.stats.pregnant') }}</span>
          </div>
          <div class="stat-pill stat-open">
            <span class="stat-num">{{ openCount }}</span>
            <span class="stat-lbl">{{ t('breeding.stats.open') }}</span>
          </div>
          <div class="stat-pill stat-due" :class="{ 'has-alerts': dueSoonCount > 0 }">
            <span class="stat-num">{{ dueSoonCount }}</span>
            <span class="stat-lbl">{{ t('breeding.stats.dueSoon') }}</span>
          </div>
        </div>
      </section>

      <!-- Upcoming alerts -->
      <section v-if="upcomingCount > 0" class="section">
        <!-- Upcoming heats -->
        <div v-if="breedingStore.upcoming.heats.length" class="alert-group">
          <h3 class="group-label">🔥 {{ t('breeding.upcoming.heats') }}</h3>
          <div
            v-for="ev in visibleHeats"
            :key="ev.id"
            class="alert-row card"
            @click="goToRepro(ev.cow_id)"
          >
            <span class="alert-cow mono">{{ ev.tag_number }}</span>
            <span v-if="ev.cow_name" class="alert-name">{{ ev.cow_name }}</span>
            <span class="spacer" />
            <span class="alert-badge heat">{{ alertLabel(ev.expected_next_heat) }}</span>
          </div>
          <button v-if="breedingStore.upcoming.heats.length > ALERT_PREVIEW" class="show-more-btn" @click="showAllAlerts.heats = !showAllAlerts.heats">
            {{ showAllAlerts.heats ? t('breeding.showLess') : t('breeding.showAll', { count: breedingStore.upcoming.heats.length }) }}
          </button>
        </div>

        <!-- Upcoming calvings -->
        <div v-if="breedingStore.upcoming.calvings.length" class="alert-group">
          <h3 class="group-label">🐮 {{ t('breeding.upcoming.calvings') }}</h3>
          <div
            v-for="ev in visibleCalvings"
            :key="ev.id"
            class="alert-row card"
            @click="goToRepro(ev.cow_id)"
          >
            <span class="alert-cow mono">{{ ev.tag_number }}</span>
            <span v-if="ev.cow_name" class="alert-name">{{ ev.cow_name }}</span>
            <span class="spacer" />
            <span class="alert-badge calving">{{ alertLabel(ev.expected_calving) }}</span>
          </div>
          <button v-if="breedingStore.upcoming.calvings.length > ALERT_PREVIEW" class="show-more-btn" @click="showAllAlerts.calvings = !showAllAlerts.calvings">
            {{ showAllAlerts.calvings ? t('breeding.showLess') : t('breeding.showAll', { count: breedingStore.upcoming.calvings.length }) }}
          </button>
        </div>

        <!-- Upcoming preg checks -->
        <div v-if="breedingStore.upcoming.pregChecks.length" class="alert-group">
          <h3 class="group-label">🩺 {{ t('breeding.upcoming.pregChecks') }}</h3>
          <div
            v-for="ev in visiblePregChecks"
            :key="ev.id"
            class="alert-row card"
            @click="goToRepro(ev.cow_id)"
          >
            <span class="alert-cow mono">{{ ev.tag_number }}</span>
            <span v-if="ev.cow_name" class="alert-name">{{ ev.cow_name }}</span>
            <span class="spacer" />
            <span class="alert-badge check">{{ alertLabel(ev.expected_preg_check) }}</span>
          </div>
          <button v-if="breedingStore.upcoming.pregChecks.length > ALERT_PREVIEW" class="show-more-btn" @click="showAllAlerts.pregChecks = !showAllAlerts.pregChecks">
            {{ showAllAlerts.pregChecks ? t('breeding.showLess') : t('breeding.showAll', { count: breedingStore.upcoming.pregChecks.length }) }}
          </button>
        </div>

        <!-- Upcoming dry-offs -->
        <div v-if="breedingStore.upcoming.dryOffs.length" class="alert-group">
          <h3 class="group-label">🌿 {{ t('breeding.upcoming.dryOffs') }}</h3>
          <div
            v-for="ev in visibleDryOffs"
            :key="ev.id"
            class="card dryoff-card"
          >
            <div class="alert-row" @click="goToRepro(ev.cow_id)">
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
          <button v-if="breedingStore.upcoming.dryOffs.length > ALERT_PREVIEW" class="show-more-btn" @click="showAllAlerts.dryOffs = !showAllAlerts.dryOffs">
            {{ showAllAlerts.dryOffs ? t('breeding.showLess') : t('breeding.showAll', { count: breedingStore.upcoming.dryOffs.length }) }}
          </button>
        </div>
      </section>

      <!-- No upcoming -->
      <section v-else-if="!breedingStore.loading" class="section">
        <p class="no-alerts">{{ t('breeding.upcoming.none') }}</p>
      </section>

      <!-- Loading -->
      <div v-if="breedingStore.loading" class="empty-state">
        <span class="spinner" />
        <p>{{ t('common.loading') }}</p>
      </div>

      <!-- Recent events preview -->
      <section v-if="recentEvents.length" class="section">
        <div class="section-header">
          <h2 class="section-label">{{ t('breeding.recentEvents') }}</h2>
          <RouterLink to="/breed/events" class="view-all-link">
            {{ t('breeding.viewAllEvents') }} →
          </RouterLink>
        </div>

        <div class="events-list">
          <BreedingEventCard
            v-for="ev in recentEvents"
            :key="ev.id"
            :event="ev"
            :show-cow="true"
            :show-delete="false"
            @edit="goToEdit"
          />
        </div>
      </section>

      <div v-else-if="!breedingStore.loading" class="empty-state">
        <p>{{ t('breeding.noEvents') }}</p>
      </div>
    </div>

    <!-- FAB -->
    <RouterLink to="/breed/log" class="fab">+</RouterLink>

    <!-- Dismiss dialog -->
    <ConfirmDialog
      :show="!!dismissTarget"
      :message="t('breeding.dismissConfirm')"
      :confirm-label="t('breeding.dismiss')"
      :cancel-label="t('common.cancel')"
      :loading="dismissing"
      @confirm="doDismiss"
      @cancel="dismissTarget = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppHeader from '../components/organisms/AppHeader.vue'
import BreedingEventCard from '../components/molecules/BreedingEventCard.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { useCowsStore } from '../stores/cows'
import { useToast } from '../composables/useToast'
import { extractApiError, resolveError } from '../utils/apiError'
import { isOfflineError } from '../services/syncManager'

const { t } = useI18n()
const router = useRouter()
const breedingStore = useBreedingEventsStore()
const cowsStore = useCowsStore()
const toast = useToast()

// Dismiss dialog
const dismissTarget = ref(null)
const dismissing = ref(false)

// Recent events preview (last 3)
const recentEvents = ref([])

// Upcoming alert collapse — show 5 per category by default
const ALERT_PREVIEW = 5
const showAllAlerts = reactive({ heats: false, calvings: false, pregChecks: false, dryOffs: false })

const visibleHeats      = computed(() => showAllAlerts.heats     ? breedingStore.upcoming.heats      : breedingStore.upcoming.heats.slice(0, ALERT_PREVIEW))
const visibleCalvings   = computed(() => showAllAlerts.calvings  ? breedingStore.upcoming.calvings   : breedingStore.upcoming.calvings.slice(0, ALERT_PREVIEW))
const visiblePregChecks = computed(() => showAllAlerts.pregChecks ? breedingStore.upcoming.pregChecks : breedingStore.upcoming.pregChecks.slice(0, ALERT_PREVIEW))
const visibleDryOffs    = computed(() => showAllAlerts.dryOffs   ? breedingStore.upcoming.dryOffs    : breedingStore.upcoming.dryOffs.slice(0, ALERT_PREVIEW))

// Stats
const pregnantCount = computed(() =>
  cowsStore.cows.filter((c) => c.sex !== 'male' && c.status === 'pregnant').length,
)

const openCount = computed(() =>
  cowsStore.cows.filter((c) => c.sex !== 'male' && c.status !== 'pregnant' && c.status !== 'sold' && c.status !== 'dead').length,
)

const dueSoonCount = computed(() => breedingStore.upcoming.calvings.length)
const upcomingCount = computed(() => breedingStore.upcomingCount)

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

function goToRepro(cowId) {
  router.push(`/cows/${cowId}/repro`)
}

function goToEdit(id) {
  router.push(`/breed/edit/${id}?from=/breed`)
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

async function acceptDryOff(ev) {
  try {
    await breedingStore.createEvent({
      cow_id: ev.cow_id,
      event_type: 'dry_off',
      event_date: new Date().toISOString().slice(0, 16),
    })
    await cowsStore.update(ev.cow_id, { is_dry: true })
    await breedingStore.fetchUpcoming()
  } catch (err) {
    if (!isOfflineError(err)) toast.show(resolveError(extractApiError(err), t), 'error')
  }
}

onMounted(async () => {
  if (cowsStore.cows.length === 0) await cowsStore.fetchAll()
  const [eventsData] = await Promise.all([
    breedingStore.fetchAll({ limit: 3 }),
    breedingStore.fetchUpcoming(),
  ])
  recentEvents.value = (eventsData || []).slice(0, 3)
})
</script>

<style scoped>
.page-content {
  padding: calc(var(--header-height) + 1rem) 1rem 5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Stats */
.stats-row {
  display: flex;
  gap: 0.75rem;
}

.stat-pill {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.75rem 0.5rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
}

.stat-num {
  font-size: 1.6rem;
  font-weight: 700;
  font-family: var(--font-mono);
  line-height: 1;
}

.stat-lbl {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.stat-pregnant .stat-num { color: #7b5ea7; }
.stat-open .stat-num { color: var(--text-secondary); }
.stat-due .stat-num { color: var(--text-secondary); }
.stat-due.has-alerts .stat-num { color: var(--warning); }

/* Alert groups */
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

.alert-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.6rem;
  padding: 0.65rem 0.85rem;
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.alert-row:active {
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

.spacer { flex: 1; }

.alert-badge {
  font-size: 0.75rem;
  font-weight: 700;
  font-family: var(--font-mono);
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
}

.alert-badge.heat {
  background: color-mix(in srgb, #e07c24 12%, transparent);
  color: #e07c24;
}

.alert-badge.calving {
  background: color-mix(in srgb, #7b5ea7 12%, transparent);
  color: #7b5ea7;
}

.alert-badge.check {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
}

.attention-section {
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  border-radius: var(--radius);
  padding: 0.75rem;
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

.alert-badge.overdue {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.alert-badge.dryoff {
  background: color-mix(in srgb, #2D6A4F 12%, transparent);
  color: #2D6A4F;
}

.btn-sm-dismiss {
  font-size: 0.72rem;
  padding: 4px 10px;
  width: auto;
  flex-shrink: 0;
}

.view-all-link {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
  white-space: nowrap;
}

.view-all-link:hover {
  text-decoration: underline;
}

.no-alerts {
  font-size: 0.85rem;
  color: var(--text-muted);
  text-align: center;
  padding: 0.5rem 0;
  margin: 0;
}

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

.events-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

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

.fetch-error-banner {
  background: var(--danger-light);
  color: var(--danger);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 500;
  border: 1px solid rgba(214, 40, 40, 0.2);
}
</style>
