<template>
  <div class="page">
    <AppHeader :title="t('breeding.hubTitle')" />

    <div class="page-content">
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
      <section v-if="recentEvents.length" class="section">
        <div class="section-header">
          <h2 class="section-label">{{ t('breeding.recentEvents') }}</h2>
        </div>
        <div class="events-list">
          <BreedingEventCard
            v-for="ev in recentEvents"
            :key="ev.id"
            :event="ev"
            :show-cow="true"
            :show-delete="authStore.isAdmin"
            @edit="goToEdit"
            @delete="confirmDelete"
          />
        </div>
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

const pregnantCount = computed(() =>
  cowsStore.cows.filter((c) => c.sex !== 'male' && c.status === 'pregnant').length,
)

const openCount = computed(() =>
  cowsStore.cows.filter((c) => c.sex !== 'male' && c.status !== 'pregnant' && c.status !== 'sold' && c.status !== 'dead').length,
)

const dueSoonCount = computed(() => breedingStore.upcoming.calvings.length)

const upcomingCount = computed(() => breedingStore.upcomingCount)

const recentEvents = computed(() => breedingStore.events.slice(0, 20))

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

.no-alerts {
  font-size: 0.85rem;
  color: var(--text-muted);
  text-align: center;
  padding: 0.5rem 0;
  margin: 0;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
</style>
