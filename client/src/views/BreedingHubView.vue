<template>
  <div class="page">
    <AppHeader :title="t('breeding.hubTitle')" />

    <div class="page-content">
      <!-- Needs Attention -->
      <section v-if="breedingStore.upcoming.needsAttention.length" class="section attention-section">
        <h3 class="group-label attention-label">{{ t('breeding.needsAttention') }}</h3>
        <div
          v-for="item in breedingStore.upcoming.needsAttention"
          :key="item.id"
          class="alert-row card attention-row"
          @click="goToRepro(item.cow_id)"
        >
          <span class="alert-cow mono">{{ item.tag_number }}</span>
          <span v-if="item.cow_name" class="alert-name">{{ item.cow_name }}</span>
          <span class="alert-badge overdue">{{ t('breeding.alert.overdue') }}</span>
          <span class="spacer" />
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
            v-for="ev in breedingStore.upcoming.heats"
            :key="ev.id"
            class="alert-row card"
            @click="goToRepro(ev.cow_id)"
          >
            <span class="alert-cow mono">{{ ev.tag_number }}</span>
            <span v-if="ev.cow_name" class="alert-name">{{ ev.cow_name }}</span>
            <span class="spacer" />
            <span class="alert-badge heat">{{ alertLabel(ev.expected_next_heat) }}</span>
          </div>
        </div>

        <!-- Upcoming calvings -->
        <div v-if="breedingStore.upcoming.calvings.length" class="alert-group">
          <h3 class="group-label">🐮 {{ t('breeding.upcoming.calvings') }}</h3>
          <div
            v-for="ev in breedingStore.upcoming.calvings"
            :key="ev.id"
            class="alert-row card"
            @click="goToRepro(ev.cow_id)"
          >
            <span class="alert-cow mono">{{ ev.tag_number }}</span>
            <span v-if="ev.cow_name" class="alert-name">{{ ev.cow_name }}</span>
            <span class="spacer" />
            <span class="alert-badge calving">{{ alertLabel(ev.expected_calving) }}</span>
          </div>
        </div>

        <!-- Upcoming preg checks -->
        <div v-if="breedingStore.upcoming.pregChecks.length" class="alert-group">
          <h3 class="group-label">🩺 {{ t('breeding.upcoming.pregChecks') }}</h3>
          <div
            v-for="ev in breedingStore.upcoming.pregChecks"
            :key="ev.id"
            class="alert-row card"
            @click="goToRepro(ev.cow_id)"
          >
            <span class="alert-cow mono">{{ ev.tag_number }}</span>
            <span v-if="ev.cow_name" class="alert-name">{{ ev.cow_name }}</span>
            <span class="spacer" />
            <span class="alert-badge check">{{ alertLabel(ev.expected_preg_check) }}</span>
          </div>
        </div>

        <!-- Upcoming dry-offs -->
        <div v-if="breedingStore.upcoming.dryOffs.length" class="alert-group">
          <h3 class="group-label">🌿 {{ t('breeding.upcoming.dryOffs') }}</h3>
          <div
            v-for="ev in breedingStore.upcoming.dryOffs"
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

      <!-- Recent events -->
      <section v-if="breedingStore.events.length" class="section">
        <div class="section-header">
          <h2 class="section-label">{{ t('breeding.recentEvents') }}</h2>
        </div>

        <!-- Filter tabs -->
        <div class="filter-chips">
          <button
            v-for="f in eventFilters"
            :key="f.value"
            class="chip"
            :class="{ active: eventFilter === f.value }"
            @click="eventFilter = f.value"
          >{{ f.label }}</button>
        </div>

        <div class="events-list">
          <BreedingEventCard
            v-for="ev in filteredEvents"
            :key="ev.id"
            :event="ev"
            :show-cow="true"
            :show-delete="authStore.isAdmin"
            @edit="goToEdit"
            @delete="confirmDelete"
          />
        </div>
        <p v-if="filteredEvents.length === 0" class="no-alerts">{{ t('breeding.noEvents') }}</p>
      </section>

      <div v-else-if="!breedingStore.loading" class="empty-state">
        <p>{{ t('breeding.noEvents') }}</p>
      </div>
    </div>

    <!-- FAB -->
    <RouterLink to="/breed/log" class="fab">+</RouterLink>

    <!-- Confirm delete -->
    <ConfirmDialog
      :show="!!deleteTargetId"
      :message="t('breeding.deleteConfirm')"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      :loading="deleting"
      @confirm="doDelete"
      @cancel="deleteTargetId = null"
    />

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
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppHeader from '../components/organisms/AppHeader.vue'
import BreedingEventCard from '../components/molecules/BreedingEventCard.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { useCowsStore } from '../stores/cows'
import { useAuthStore } from '../stores/auth'

const { t } = useI18n()
const router = useRouter()
const breedingStore = useBreedingEventsStore()
const cowsStore = useCowsStore()
const authStore = useAuthStore()

const deleteTargetId = ref(null)
const deleting = ref(false)
const dismissTarget = ref(null)
const dismissing = ref(false)
const eventFilter = ref('')

const eventFilters = [
  { value: '', label: t('cows.filterAll') },
  { value: 'heat_observed', label: '🔥' },
  { value: 'ai_insemination,bull_service', label: '🧬' },
  { value: 'preg_check_positive,preg_check_negative', label: '🩺' },
  { value: 'calving', label: '🐮' },
  { value: 'dry_off', label: '🌿' },
]

const pregnantCount = computed(() =>
  cowsStore.cows.filter((c) => c.sex !== 'male' && c.status === 'pregnant').length,
)

const openCount = computed(() =>
  cowsStore.cows.filter((c) => c.sex !== 'male' && c.status !== 'pregnant' && c.status !== 'sold' && c.status !== 'dead').length,
)

const dueSoonCount = computed(() => breedingStore.upcoming.calvings.length)

const upcomingCount = computed(() => breedingStore.upcomingCount)

const filteredEvents = computed(() => {
  const all = breedingStore.events.slice(0, 50)
  if (!eventFilter.value) return all.slice(0, 20)
  const codes = eventFilter.value.split(',')
  return all.filter((e) => codes.includes(e.event_type)).slice(0, 20)
})

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

function confirmDelete(id) {
  deleteTargetId.value = id
}

function openDismiss(item) {
  dismissTarget.value = item
}

async function doDismiss() {
  dismissing.value = true
  try {
    await breedingStore.dismissEvent(dismissTarget.value.id)
  } finally {
    dismissing.value = false
    dismissTarget.value = null
  }
}

async function acceptDryOff(ev) {
  try {
    // Create dry_off breeding event
    await breedingStore.createEvent({
      cow_id: ev.cow_id,
      event_type: 'dry_off',
      event_date: new Date().toISOString().slice(0, 16),
    })
    // Update cow is_dry flag
    await cowsStore.update(ev.cow_id, { is_dry: true })
    // Refresh upcoming alerts
    await breedingStore.fetchUpcoming()
  } catch {
    // Silently fail — event card will stay if failed
  }
}

async function doDelete() {
  deleting.value = true
  try {
    await breedingStore.deleteEvent(deleteTargetId.value)
  } finally {
    deleting.value = false
    deleteTargetId.value = null
  }
}

onMounted(async () => {
  if (cowsStore.cows.length === 0) await cowsStore.fetchAll()
  await Promise.all([
    breedingStore.fetchAll({ limit: 20 }),
    breedingStore.fetchUpcoming(),
  ])
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
  gap: 0.6rem;
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
  background: var(--surface);
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

.filter-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}

.filter-chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex-shrink: 0;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.chip.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
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
</style>
