<template>
  <div class="page">
    <AppHeader :title="t('breeding.hubTitle')" show-back back-to="/" />

    <div class="page-content">
      <!-- Fetch error banner -->
      <div v-if="breedingStore.error && !breedingStore.loading" class="fetch-error-banner">
        {{ resolveError(breedingStore.error, t) }}
      </div>

      <!-- Loading -->
      <div v-if="breedingStore.loading" class="empty-state">
        <span class="spinner" />
        <p>{{ t('common.loading') }}</p>
      </div>

      <template v-else>
        <!-- Stats row -->
        <section class="section">
          <div data-tour="breed-stats" class="stats-row">
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

        <!-- Nav cards -->
        <section class="section nav-cards">
          <!-- Notifications card -->
          <div
            data-tour="breed-notifications"
            class="nav-card card"
            @click="goTo('/breed/notifications')"
          >
            <div class="nav-card-icon"><AppIcon name="bell" :size="22" /></div>
            <div class="nav-card-body">
              <div class="nav-card-header">
                <span class="nav-card-title">{{ t('breeding.notificationsCard') }}</span>
                <span v-if="notificationCount > 0" class="nav-card-badge">{{
                  notificationCount
                }}</span>
              </div>
              <span class="nav-card-subtitle">{{ notificationSubtitle }}</span>
            </div>
            <span class="nav-card-arrow">›</span>
          </div>

          <!-- Recent Events card -->
          <div data-tour="breed-events" class="nav-card card" @click="goTo('/breed/events')">
            <div class="nav-card-icon"><AppIcon name="clipboard-list" :size="22" /></div>
            <div class="nav-card-body">
              <div class="nav-card-header">
                <span class="nav-card-title">{{ t('breeding.recentEventsCard') }}</span>
                <span v-if="breedingStore.total > 0" class="nav-card-badge secondary">{{
                  breedingStore.total
                }}</span>
              </div>
              <span class="nav-card-subtitle">{{ latestEventLabel }}</span>
            </div>
            <span class="nav-card-arrow">›</span>
          </div>
        </section>
      </template>
    </div>

    <!-- FAB -->
    <RouterLink data-tour="breed-log" to="/breed/log" class="fab" :title="t('breeding.logEvent')"
      >+</RouterLink
    >

    <TourButton above-fab @start-tour="startTour" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppHeader from '../components/organisms/AppHeader.vue'
import AppIcon from '../components/atoms/AppIcon.vue'
import TourButton from '../components/atoms/TourButton.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { useAnimalsStore } from '../stores/animals'
import { resolveError } from '../utils/apiError'
import { useTour } from '../composables/useTour'

const { t } = useI18n()
const router = useRouter()
const breedingStore = useBreedingEventsStore()
const animalsStore = useAnimalsStore()

const { startTour } = useTour('breeding-hub', () => [
  {
    element: '[data-tour="breed-stats"]',
    popover: {
      title: t('tour.breedingHub.stats.title'),
      description: t('tour.breedingHub.stats.desc'),
    },
  },
  {
    element: '[data-tour="breed-notifications"]',
    popover: {
      title: t('tour.breedingHub.notifications.title'),
      description: t('tour.breedingHub.notifications.desc'),
    },
  },
  {
    element: '[data-tour="breed-events"]',
    popover: {
      title: t('tour.breedingHub.events.title'),
      description: t('tour.breedingHub.events.desc'),
    },
  },
  {
    element: '[data-tour="breed-log"]',
    popover: {
      title: t('tour.breedingHub.logEvent.title'),
      description: t('tour.breedingHub.logEvent.desc'),
    },
  },
])

function goTo(path) {
  router.push(path)
}

// ── Stats ────────────────────────────────────────────────────────────────────
const pregnantCount = computed(
  () => animalsStore.animals.filter((c) => c.sex !== 'male' && c.status === 'pregnant').length
)

const openCount = computed(
  () =>
    animalsStore.animals.filter(
      (c) =>
        c.sex !== 'male' && c.status !== 'pregnant' && c.status !== 'sold' && c.status !== 'dead'
    ).length
)

const dueSoonCount = computed(() => breedingStore.upcoming.calvings.length)

// ── Notification card ────────────────────────────────────────────────────────
const notificationCount = computed(() => breedingStore.upcomingCount)

const overdueCount = computed(() => breedingStore.upcoming.needsAttention.length)
const upcomingOnlyCount = computed(
  () =>
    breedingStore.upcoming.heats.length +
    breedingStore.upcoming.calvings.length +
    breedingStore.upcoming.pregChecks.length +
    breedingStore.upcoming.dryOffs.length
)

const notificationSubtitle = computed(() => {
  const parts = []
  if (overdueCount.value > 0) parts.push(t('breeding.overdueCount', { count: overdueCount.value }))
  if (upcomingOnlyCount.value > 0)
    parts.push(t('breeding.upcomingCount', { count: upcomingOnlyCount.value }))
  return parts.join(' · ') || t('breeding.upcoming.none')
})

// ── Recent events card ───────────────────────────────────────────────────────
const latestEvent = ref(null)

const latestEventLabel = computed(() => {
  if (!latestEvent.value) return t('breeding.noEvents')
  const ev = latestEvent.value
  const type = t(`breeding.eventTypes.${ev.event_type}`)
  return t('breeding.lastEvent', { type, tag: ev.tag_number || ev.cow_name || '' })
})

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  if (animalsStore.animals.length === 0) await animalsStore.fetchAll()
  const [eventsData] = await Promise.all([
    breedingStore.fetchAll({ limit: 1 }),
    breedingStore.fetchUpcoming(),
  ])
  if (eventsData?.length) latestEvent.value = eventsData[0]
})
</script>

<style scoped>
.page-content {
  padding: calc(var(--header-height) + 1rem) 1rem 5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* ── Stats ── */
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
  box-shadow: var(--shadow-card);
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

.stat-pregnant .stat-num {
  color: #7b5ea7;
}
.stat-open .stat-num {
  color: var(--text-secondary);
}
.stat-due .stat-num {
  color: var(--text-secondary);
}
.stat-due.has-alerts .stat-num {
  color: var(--warning);
}

/* ── Nav cards ── */
.nav-cards {
  gap: 0.75rem;
}

.nav-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1.25rem;
  cursor: pointer;
  transition:
    box-shadow 0.18s,
    transform 0.18s,
    border-color 0.18s;
}

@media (hover: hover) {
  .nav-card:hover {
    box-shadow: var(--shadow);
    border-color: var(--border-strong);
    transform: translateY(-1px);
  }
}

.nav-card:active {
  box-shadow: 0 0 0 2px var(--primary-ring);
  transform: translateY(0);
}

.nav-card-icon {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--primary);
}

.nav-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-card-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text);
}

.nav-card-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 100px;
  font-size: 0.7rem;
  font-weight: 700;
  font-family: var(--font-mono);
  background: var(--danger);
  color: #fff;
}

.nav-card-badge.secondary {
  background: var(--text-secondary);
}

.nav-card-subtitle {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-card-arrow {
  font-size: 1.5rem;
  color: var(--text-secondary);
  flex-shrink: 0;
  opacity: 0.5;
}

/* ── Error banner ── */
.fetch-error-banner {
  background: var(--danger-light);
  color: var(--danger);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 500;
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-left: 3px solid var(--danger);
}
</style>
