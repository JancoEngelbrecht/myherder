<template>
  <div class="page">
    <AppHeader
      :title="animal ? animal.tag_number : t('breeding.reproTitle')"
      show-back
      :back-to="`/animals/${animalId}`"
    />

    <div class="page-content">
      <!-- Loading -->
      <div v-if="loading" class="empty-state">
        <span class="spinner" />
        <p>{{ t('common.loading') }}</p>
      </div>

      <template v-else>
        <!-- Status banner -->
        <div class="status-banner" :class="bannerClass">
          <span class="banner-icon"><AppIcon :name="bannerIcon" :size="28" /></span>
          <div class="banner-body">
            <span class="banner-status">{{ bannerStatus }}</span>
            <span v-if="daysToCalving !== null" class="banner-sub">
              {{
                daysToCalving > 0
                  ? t('breeding.status.daysToCalving', { days: daysToCalving })
                  : t('breeding.status.overdue')
              }}
            </span>
          </div>
        </div>

        <!-- Gestation progress -->
        <div v-if="isPregnant && latestEvent?.expected_calving" class="gestation-card card">
          <div class="gestation-header">
            <span class="gestation-label">{{ t('breeding.gestationDays') }}</span>
            <span class="gestation-progress mono"
              >{{ gestationDays }} / {{ breedGestation }} {{ t('common.days') }}</span
            >
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${gestationPct}%` }" />
          </div>
          <div class="gestation-dates">
            <span class="mono">{{ formatDate(latestEvent.event_date) }}</span>
            <span class="pct-label">{{ gestationPct }}%</span>
            <span class="mono">{{ formatDate(latestEvent.expected_calving) }}</span>
          </div>
        </div>

        <!-- Key dates card -->
        <div v-if="latestEvent" class="card key-dates-card">
          <h3 class="section-label">{{ t('breeding.keyDates') }}</h3>
          <div class="dates-grid">
            <div v-if="latestEvent.expected_next_heat" class="date-item">
              <span class="date-icon"><AppIcon name="flame" :size="18" /></span>
              <div class="date-body">
                <span class="date-key">{{ t('breeding.dates.nextHeat') }}</span>
                <span class="date-val mono">{{ formatDate(latestEvent.expected_next_heat) }}</span>
              </div>
            </div>
            <div v-if="latestEvent.expected_preg_check" class="date-item">
              <span class="date-icon"><AppIcon name="stethoscope" :size="18" /></span>
              <div class="date-body">
                <span class="date-key">{{ t('breeding.dates.pregCheck') }}</span>
                <span class="date-val mono">{{ formatDate(latestEvent.expected_preg_check) }}</span>
              </div>
            </div>
            <div v-if="latestEvent.expected_calving" class="date-item">
              <span class="date-icon"><AppIcon name="baby" :size="18" /></span>
              <div class="date-body">
                <span class="date-key">{{ t('breeding.dates.calving') }}</span>
                <span class="date-val mono">{{ formatDate(latestEvent.expected_calving) }}</span>
              </div>
            </div>
            <div v-if="latestEvent.expected_dry_off" class="date-item">
              <span class="date-icon"><AppIcon name="leaf" :size="18" /></span>
              <div class="date-body">
                <span class="date-key">{{ t('breeding.dates.dryOff') }}</span>
                <span class="date-val mono">{{ formatDate(latestEvent.expected_dry_off) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Lifetime stats -->
        <div v-if="lifetimeStats.calvings > 0" class="card">
          <h3 class="section-label">{{ t('breeding.lifetime.title') }}</h3>
          <div class="lifetime-grid">
            <div class="lifetime-item">
              <span class="lifetime-num mono">{{ lifetimeStats.calvings }}</span>
              <span class="lifetime-lbl">{{ t('breeding.lifetime.calvings') }}</span>
            </div>
            <div v-if="lifetimeStats.firstCalving" class="lifetime-item">
              <span class="lifetime-num mono">{{ lifetimeStats.firstCalving }}</span>
              <span class="lifetime-lbl">{{ t('breeding.lifetime.firstCalving') }}</span>
            </div>
            <div v-if="lifetimeStats.lastCalving" class="lifetime-item">
              <span class="lifetime-num mono">{{ lifetimeStats.lastCalving }}</span>
              <span class="lifetime-lbl">{{ t('breeding.lifetime.lastCalving') }}</span>
            </div>
          </div>
        </div>

        <!-- Action button -->
        <div class="actions-section">
          <RouterLink :to="`/breed/log?animal_id=${animalId}`" class="btn-primary action-btn">
            + {{ t('breeding.logEvent') }}
          </RouterLink>
        </div>

        <!-- Event timeline -->
        <section class="section">
          <h2 class="section-label">{{ t('breeding.recentEvents') }}</h2>

          <div v-if="animalEvents.length" class="events-list">
            <BreedingEventCard
              v-for="ev in animalEvents"
              :key="ev.id"
              :event="ev"
              :show-cow="false"
              :show-delete="authStore.isAdmin"
              @edit="goToEdit"
              @delete="confirmDelete"
            />
          </div>

          <div v-else class="empty-state">
            <p>{{ t('breeding.noEvents') }}</p>
          </div>
        </section>
      </template>
    </div>

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

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/organisms/AppHeader.vue'
import AppIcon from '../components/atoms/AppIcon.vue'
import BreedingEventCard from '../components/molecules/BreedingEventCard.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { useAnimalsStore } from '../stores/animals'
import { useAuthStore } from '../stores/auth'
import { useBreedTypesStore } from '../stores/breedTypes'
import { useToast } from '../composables/useToast'
import { extractApiError, resolveError } from '../utils/apiError'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const breedingStore = useBreedingEventsStore()
const animalsStore = useAnimalsStore()
const authStore = useAuthStore()
const breedTypesStore = useBreedTypesStore()
const toast = useToast()

const animalId = computed(() => route.params.id)
const animalEvents = ref([])
const loading = ref(true)
const deleteTargetId = ref(null)
const deleting = ref(false)

const animal = computed(() => animalsStore.animals.find((c) => c.id === animalId.value) ?? null)

const latestEvent = computed(() => {
  if (!animalEvents.value.length) return null
  return animalEvents.value.reduce(
    (latest, ev) => (!latest || ev.event_date > latest.event_date ? ev : latest),
    null
  )
})

const isPregnant = computed(() => animal.value?.status === 'pregnant')

const breedGestation = computed(() => {
  if (!animal.value?.breed_type_id) return 283
  return breedTypesStore.getById(animal.value.breed_type_id)?.gestation_days ?? 283
})

const gestationDays = computed(() => {
  if (!latestEvent.value?.event_date) return 0
  const today = new Date()
  const conception = new Date(latestEvent.value.event_date)
  return Math.max(0, Math.round((today - conception) / 86400000))
})

const gestationPct = computed(
  () =>
    breedingStore.gestationPercent(latestEvent.value?.expected_calving, breedGestation.value) ?? 0
)

const daysToCalving = computed(() => {
  if (!latestEvent.value?.expected_calving) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const calving = new Date(latestEvent.value.expected_calving)
  return Math.round((calving - today) / 86400000)
})

const bannerClass = computed(() => {
  if (isPregnant.value) return 'banner-pregnant'
  return 'banner-open'
})

const bannerIcon = computed(() => (isPregnant.value ? 'baby' : 'cow'))

const bannerStatus = computed(() =>
  isPregnant.value ? t('breeding.status.pregnant') : t('breeding.status.open')
)

const lifetimeStats = computed(() => {
  const calvings = animalEvents.value.filter((e) => e.event_type === 'calving')
  if (!calvings.length) return { calvings: 0, firstCalving: null, lastCalving: null }
  const sorted = [...calvings].sort((a, b) => a.event_date.localeCompare(b.event_date))
  return {
    calvings: calvings.length,
    firstCalving: sorted[0].event_date.slice(0, 10),
    lastCalving: sorted[sorted.length - 1].event_date.slice(0, 10),
  }
})

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function goToEdit(id) {
  router.push(`/breed/edit/${id}?from=/animals/${animalId.value}/repro`)
}

function confirmDelete(id) {
  deleteTargetId.value = id
}

async function doDelete() {
  deleting.value = true
  const snapshot = [...animalEvents.value]
  try {
    animalEvents.value = animalEvents.value.filter((e) => e.id !== deleteTargetId.value)
    await breedingStore.deleteEvent(deleteTargetId.value)
  } catch (err) {
    animalEvents.value = snapshot
    toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    deleting.value = false
    deleteTargetId.value = null
  }
}

onMounted(async () => {
  loading.value = true
  if (!breedTypesStore.hasData) breedTypesStore.fetchActive().catch(() => {})
  if (animalsStore.animals.length === 0) await animalsStore.fetchAll()
  animalEvents.value = await breedingStore.fetchForCow(animalId.value)
  loading.value = false
})
</script>

<style scoped>
.page-content {
  padding: calc(var(--header-height) + 1rem) 1rem 5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Status banner */
.status-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
}

.banner-pregnant {
  background: color-mix(in srgb, #7b5ea7 10%, transparent);
  border: 1px solid color-mix(in srgb, #7b5ea7 30%, transparent);
}

.banner-pregnant .banner-icon {
  color: #7b5ea7;
}

.banner-open .banner-icon {
  color: var(--text-secondary);
}

.banner-open {
  background: var(--surface);
  border: 1px solid var(--border);
}

.banner-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.banner-body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.banner-status {
  font-weight: 700;
  font-size: 1rem;
}

.banner-sub {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

/* Gestation progress */
.gestation-card {
  padding: 0.85rem 1rem;
}

.gestation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
}

.gestation-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.gestation-progress {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
}

.progress-track {
  height: 10px;
  background: var(--bg);
  border-radius: 5px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #7b5ea7;
  border-radius: 5px;
  transition: width 0.4s ease;
}

.gestation-dates {
  display: flex;
  justify-content: space-between;
  margin-top: 0.4rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.pct-label {
  font-weight: 700;
  color: #7b5ea7;
}

/* Key dates */
.key-dates-card {
  padding: 0.85rem 1rem;
}

.dates-grid {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.5rem;
}

.date-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.date-icon {
  flex-shrink: 0;
  width: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.date-body {
  display: flex;
  justify-content: space-between;
  flex: 1;
  align-items: center;
}

.date-key {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.date-val {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text);
}

/* Lifetime stats */
.lifetime-grid {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.lifetime-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.lifetime-num {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--primary);
}

.lifetime-lbl {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

/* Actions */
.actions-section {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.action-btn {
  flex: 1 1 100%;
  text-align: center;
  text-decoration: none;
}

@media (min-width: 600px) {
  .action-btn {
    flex: 0 1 auto;
    width: auto;
  }
}

/* Events list */
.section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
</style>
