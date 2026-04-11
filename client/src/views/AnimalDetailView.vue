<template>
  <div class="page">
    <AppHeader :title="animal ? animal.tag_number : ''" :show-back="true" back-to="/animals" />

    <div class="page-content">
      <!-- Loading -->
      <div v-if="loading" class="center-spinner">
        <div class="spinner" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="btn-secondary" style="width: auto; margin-top: 8px" @click="load">
          {{ t('common.retry') }}
        </button>
      </div>

      <template v-else-if="animal">
        <!-- Hero -->
        <div class="animal-hero">
          <div class="animal-avatar-lg" :class="`sex-${animal.sex}`">
            <AppIcon
              :name="animal.sex === 'male' ? speciesIcon.male : speciesIcon.female"
              :size="32"
              :stroke-width="1.5"
            />
          </div>
          <div class="animal-hero-info">
            <div class="animal-hero-tag mono">{{ animal.tag_number }}</div>
            <div v-if="animal.name" class="animal-hero-name">{{ animal.name }}</div>
            <div class="hero-badges">
              <span class="badge" :class="`badge-${animal.status}`">
                {{ t(`status.${animal.status}`) }}
              </span>
              <span v-if="lifePhase" class="badge" :class="`badge-phase-${lifePhase}`">
                {{ t(`lifePhase.${lifePhase}`) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Info grid -->
        <div class="card info-card">
          <h3 class="section-label">{{ t('animalDetail.info') }}</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">{{ t('animalDetail.breed') }}</span>
              <span class="info-value">{{ animal.breed_type_name || animal.breed || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ t('animalDetail.dob') }}</span>
              <span class="info-value">{{ formatDate(animal.dob) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ t('animalDetail.age') }}</span>
              <span class="info-value">{{ calcAge(animal.dob) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ t('animalDetail.sex') }}</span>
              <span class="info-value">{{ t(`sex.${animal.sex}`) }}</span>
            </div>
            <div v-if="animal.sex === 'male' && animal.purpose" class="info-item">
              <span class="info-label">{{ t('animalDetail.purpose') }}</span>
              <span class="info-value">{{
                t(
                  `animalForm.purpose${animal.purpose === 'natural_service' ? 'Natural' : animal.purpose === 'ai_semen_donor' ? 'AI' : 'Both'}`
                )
              }}</span>
            </div>
            <div v-if="animal.sex === 'male' && animal.is_external" class="info-item">
              <span class="info-label">{{ t('animalDetail.external') }}</span>
              <span class="info-value">{{ t('common.yes') }}</span>
            </div>
          </div>
          <div v-if="animal.notes" class="info-notes">{{ animal.notes }}</div>
        </div>

        <!-- Lineage -->
        <div class="card lineage-card">
          <h3 class="section-label">{{ t('animalDetail.lineage') }}</h3>
          <div class="lineage-tree">
            <div class="parent-col">
              <RouterLink
                v-if="animal.sire_id"
                :to="`/animals/${animal.sire_id}`"
                class="parent-card sire"
              >
                <AppIcon :name="speciesIcon.male" :size="20" :stroke-width="1.5" />
                <div>
                  <div class="parent-role">
                    {{ t(`animalDetail.sire_${speciesCode}`, t('animalDetail.sire')) }}
                  </div>
                  <div class="parent-name">{{ animal.sire_name || '—' }}</div>
                </div>
              </RouterLink>
              <div v-else class="parent-card unknown">
                <AppIcon :name="speciesIcon.male" :size="20" :stroke-width="1.5" />
                <div>
                  <div class="parent-role">
                    {{ t(`animalDetail.sire_${speciesCode}`, t('animalDetail.sire')) }}
                  </div>
                  <div class="parent-name unknown-text">{{ t('animalDetail.unknown') }}</div>
                </div>
              </div>

              <RouterLink
                v-if="animal.dam_id"
                :to="`/animals/${animal.dam_id}`"
                class="parent-card dam"
              >
                <AppIcon :name="speciesIcon.female" :size="20" :stroke-width="1.5" />
                <div>
                  <div class="parent-role">
                    {{ t(`animalDetail.dam_${speciesCode}`, t('animalDetail.dam')) }}
                  </div>
                  <div class="parent-name">{{ animal.dam_name || '—' }}</div>
                </div>
              </RouterLink>
              <div v-else class="parent-card unknown">
                <AppIcon :name="speciesIcon.female" :size="20" :stroke-width="1.5" />
                <div>
                  <div class="parent-role">
                    {{ t(`animalDetail.dam_${speciesCode}`, t('animalDetail.dam')) }}
                  </div>
                  <div class="parent-name unknown-text">{{ t('animalDetail.unknown') }}</div>
                </div>
              </div>
            </div>

            <div class="lineage-connector">
              <div class="connector-line" />
              <div class="connector-dot" />
            </div>

            <div class="this-animal-card">
              <AppIcon
                :name="animal.sex === 'male' ? speciesIcon.male : speciesIcon.female"
                :size="24"
                :stroke-width="1.5"
              />
              <div class="mono this-tag">{{ animal.tag_number }}</div>
            </div>
          </div>
        </div>

        <!-- Offspring -->
        <div class="card">
          <h3 class="section-label">{{ t('animalDetail.offspring') }}</h3>

          <!-- Incomplete offspring indicator -->
          <div v-if="incompleteOffspring" class="incomplete-offspring-banner">
            <span>{{
              t('animalDetail.offspringRegistered', {
                registered: incompleteOffspring.registered,
                total: incompleteOffspring.total,
              })
            }}</span>
            <RouterLink :to="incompleteOffspringRegisterRoute" class="register-remaining-link"
              >{{ t('animalDetail.registerRemaining') }} ›</RouterLink
            >
          </div>

          <div v-if="offspring.length === 0" class="no-offspring">
            {{ t('animalDetail.noOffspring') }}
          </div>
          <div v-else class="offspring-list">
            <RouterLink
              v-for="calf in offspring"
              :key="calf.id"
              :to="`/animals/${calf.id}`"
              class="offspring-item"
            >
              <AppIcon
                :name="calf.sex === 'male' ? speciesIcon.male : speciesIcon.female"
                :size="18"
                :stroke-width="1.5"
                class="offspring-icon"
              />
              <span class="mono offspring-tag">{{ calf.tag_number }}</span>
              <span class="offspring-name">{{ calf.name || '—' }}</span>
              <span class="badge" :class="`badge-${calf.status}`">{{
                t(`status.${calf.status}`)
              }}</span>
              <span class="offspring-chevron">›</span>
            </RouterLink>
          </div>
        </div>

        <!-- Reproduction (female only, breeding enabled, permission required) -->
        <div
          v-if="
            flags.breeding && animal.sex !== 'male' && authStore.hasPermission('can_log_breeding')
          "
          class="card treatment-card"
        >
          <div class="treatment-header">
            <h3 class="section-label">{{ t('breeding.reproTitle') }}</h3>
            <RouterLink :to="`/animals/${animal.id}/repro`" class="view-all-link">
              {{ t('animalDetail.viewAll') }} ›
            </RouterLink>
          </div>

          <div v-if="reproLoading" class="spinner-mini"><div class="spinner" /></div>

          <template v-if="!reproLoading">
            <RouterLink :to="`/animals/${animal.id}/repro`" class="treatment-summary-link">
              <div class="tx-summary-body">
                <div class="tx-summary-last-med">
                  <template v-if="latestReproEvent">
                    {{ getEventType(latestReproEvent.event_type)?.emoji }}
                    {{
                      t(
                        `breeding.eventTypes.${latestReproEvent.event_type}`,
                        latestReproEvent.event_type
                      )
                    }}
                  </template>
                  <template v-else>{{ t('breeding.noEvents') }}</template>
                </div>
                <div v-if="latestReproEvent" class="tx-summary-meta mono">
                  {{ latestReproEvent.event_date?.slice(0, 10) }}
                  <template v-if="latestReproEvent.expected_calving">
                    · {{ latestReproEvent.expected_calving }}
                  </template>
                </div>
              </div>
              <span class="tx-summary-chevron">›</span>
            </RouterLink>
          </template>
        </div>

        <!-- Health Issues (compact) -->
        <div
          v-if="flags.healthIssues && authStore.hasPermission('can_log_issues')"
          class="card treatment-card"
        >
          <div class="treatment-header">
            <h3 class="section-label">{{ t('healthIssues.title') }}</h3>
            <RouterLink :to="`/animals/${animal.id}/issues`" class="view-all-link">
              {{ t('animalDetail.viewAll') }} ›
            </RouterLink>
          </div>

          <div v-if="issuesLoading" class="spinner-mini"><div class="spinner" /></div>

          <template v-if="!issuesLoading">
            <div v-if="animalIssues.length === 0" class="no-offspring">
              {{ t('healthIssues.noIssues') }}
            </div>
            <RouterLink v-else :to="`/animals/${animal.id}/issues`" class="treatment-summary-link">
              <div class="tx-summary-body">
                <div class="tx-summary-last-med">
                  {{
                    (animalIssues[0].issue_types || [])
                      .map((c) => issueTypesStore.getByCode(c)?.emoji || '❓')
                      .join(' ')
                  }}
                  {{
                    (animalIssues[0].issue_types || [])
                      .map((c) => issueTypesStore.getByCode(c)?.name || c)
                      .join(' + ')
                  }}
                </div>
                <div class="tx-summary-meta mono">
                  {{ formatDate(animalIssues[0].observed_at) }}
                  <template v-if="openIssueCount">
                    · {{ openIssueCount }} {{ t('healthIssues.open').toLowerCase() }}</template
                  >
                </div>
              </div>
              <span class="tx-summary-chevron">›</span>
            </RouterLink>
          </template>
        </div>

        <!-- Treatment History (compact) -->
        <div
          v-if="flags.treatments && authStore.hasPermission('can_log_treatments')"
          class="card treatment-card"
        >
          <div class="treatment-header">
            <h3 class="section-label">{{ t('animalDetail.treatments') }}</h3>
            <RouterLink :to="`/animals/${animal.id}/treatments`" class="view-all-link">
              {{ t('animalDetail.viewAll') }} ›
            </RouterLink>
          </div>

          <div v-if="treatmentsLoading" class="spinner-mini"><div class="spinner" /></div>

          <!-- On withdrawal badge -->
          <div v-if="onWithdrawal" class="withdrawal-active-badge">
            <AppIcon name="ban" :size="16" :stroke-width="2" />
            {{ t('animalDetail.onWithdrawal') }}
            <span class="mono">{{ formatDateTime(animalWithdrawalEnd) }}</span>
          </div>

          <template v-if="!treatmentsLoading">
            <div v-if="animalTreatments.length === 0" class="no-offspring">
              {{ t('animalDetail.noTreatments') }}
            </div>
            <RouterLink
              v-else
              :to="`/animals/${animal.id}/treatments`"
              class="treatment-summary-link"
            >
              <div class="tx-summary-body">
                <div class="tx-summary-last-med">{{ firstMedName(animalTreatments[0]) }}</div>
                <div class="tx-summary-meta mono">
                  {{ formatDate(animalTreatments[0].treatment_date) }} ·
                  {{ t('animalDetail.treatmentsCount', { count: animalTreatments.length }) }}
                </div>
              </div>
              <span class="tx-summary-chevron">›</span>
            </RouterLink>
          </template>
        </div>

        <!-- Breeding action (female animals, breeding enabled, permission required) -->
        <div
          v-if="
            flags.breeding && animal.sex !== 'male' && authStore.hasPermission('can_log_breeding')
          "
          class="action-row"
        >
          <RouterLink :to="`/breed/log?animal_id=${animal.id}`" class="btn-secondary edit-link">
            <AppIcon name="dna" :size="16" :stroke-width="1.5" />
            {{ t('breeding.logEvent') }}
          </RouterLink>
        </div>

        <!-- Actions -->
        <div v-if="authStore.canManageAnimals" class="action-row">
          <RouterLink :to="`/animals/${animal.id}/edit`" class="btn-secondary edit-link">
            <AppIcon name="edit" :size="16" :stroke-width="1.5" />
            {{ t('animalDetail.edit') }}
          </RouterLink>
          <button
            v-if="authStore.isAdmin"
            class="btn-danger btn-danger--flex"
            @click="confirmDelete"
          >
            <AppIcon name="trash-2" :size="16" :stroke-width="1.5" />
            {{ t('animalDetail.delete') }}
          </button>
        </div>
      </template>
    </div>

    <ConfirmDialog
      :show="showDeleteDialog"
      :message="t('animalDetail.deleteConfirm')"
      :confirm-label="t('animalDetail.deleteYes')"
      :cancel-label="t('animalDetail.deleteNo')"
      :loading="deleting"
      @confirm="handleDelete"
      @cancel="showDeleteDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAnimalsStore, computeLifePhase } from '../stores/animals'
import { useAuthStore } from '../stores/auth'
import { useBreedTypesStore } from '../stores/breedTypes'
import { useTreatmentsStore } from '../stores/treatments'
import { useHealthIssuesStore } from '../stores/healthIssues'
import { useIssueTypesStore } from '../stores/issueTypes'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { useFeatureFlagsStore } from '../stores/featureFlags'
import { useSpeciesTerms } from '../composables/useSpeciesTerms'
import { getEventType } from '../config/breedingEventTypes'
import { formatDate, formatDateTime } from '../utils/format'
import api from '../services/api'
import AppHeader from '../components/organisms/AppHeader.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'
import AppIcon from '../components/atoms/AppIcon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const animalsStore = useAnimalsStore()
const authStore = useAuthStore()
const treatmentsStore = useTreatmentsStore()
const healthIssuesStore = useHealthIssuesStore()
const issueTypesStore = useIssueTypesStore()
const breedingEventsStore = useBreedingEventsStore()

const breedTypesStore = useBreedTypesStore()
const featureFlagsStore = useFeatureFlagsStore()
const { speciesCode, icon: speciesIcon, lifePhasesConfig } = useSpeciesTerms()

const flags = computed(() => featureFlagsStore.flags)

const animal = ref(null)
const loading = ref(true)
const error = ref('')

const lifePhase = computed(() => {
  if (!animal.value) return null
  const bt = animal.value.breed_type_id ? breedTypesStore.getById(animal.value.breed_type_id) : null
  return computeLifePhase(animal.value, bt, lifePhasesConfig.value)
})
const showDeleteDialog = ref(false)
const deleting = ref(false)
const latestReproEvent = ref(null)
const reproLoading = ref(false)
const treatmentsLoading = computed(() => treatmentsStore.loadingByCow)
const issuesLoading = computed(() => healthIssuesStore.loadingByCow)
const animalIssues = computed(() =>
  animal.value ? healthIssuesStore.getAnimalIssues(animal.value.id) : []
)
const openIssueCount = computed(() => animalIssues.value.filter((i) => i.status === 'open').length)

const offspring = computed(() => {
  if (!animal.value) return []
  return animalsStore.animals.filter(
    (c) => c.sire_id === animal.value.id || c.dam_id === animal.value.id
  )
})

// Incomplete offspring: birth event where offspring_count > registered
const latestBirthEvent = ref(null)
const incompleteOffspring = computed(() => {
  if (!latestBirthEvent.value) return null
  const ev = latestBirthEvent.value
  // Count by birth_event_id link, or fall back to dam_id + matching DOB
  const eventDate = ev.event_date?.slice(0, 10)
  const registeredCount = animalsStore.animals.filter(
    (c) => c.birth_event_id === ev.id || (c.dam_id === animal.value?.id && c.dob === eventDate)
  ).length
  if (ev.offspring_count > registeredCount) {
    return { total: ev.offspring_count, registered: registeredCount, eventId: ev.id }
  }
  return null
})
const incompleteOffspringRegisterRoute = computed(() => {
  if (!incompleteOffspring.value || !animal.value) return '/animals/new'
  const { eventId, registered, total } = incompleteOffspring.value
  return {
    path: '/animals/new',
    query: {
      birth_event_id: eventId,
      dam_id: animal.value.id,
      offspring_total: String(total),
      offspring_index: String(registered + 1),
      dob: latestBirthEvent.value?.event_date?.slice(0, 10) ?? '',
    },
  }
})

const animalTreatments = computed(() =>
  animal.value ? treatmentsStore.getCowTreatments(animal.value.id) : []
)

const onWithdrawal = computed(() => {
  if (animal.value?.sex === 'male') return false
  if (['heifer', 'calf', 'lamb'].includes(lifePhase.value)) return false
  const now = new Date()
  return animalTreatments.value.some(
    (t) => t.withdrawal_end_milk && new Date(t.withdrawal_end_milk) > now
  )
})

const animalWithdrawalEnd = computed(() => {
  if (animal.value?.sex === 'male') return null
  if (['heifer', 'calf', 'lamb'].includes(lifePhase.value)) return null
  const now = new Date()
  const dates = animalTreatments.value
    .filter((t) => t.withdrawal_end_milk && new Date(t.withdrawal_end_milk) > now)
    .map((t) => new Date(t.withdrawal_end_milk))
  if (!dates.length) return null
  return new Date(Math.max(...dates.map((d) => d.getTime())))
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    animal.value = await animalsStore.fetchOne(route.params.id)
    // Ensure animals list is loaded for offspring computation
    if (animalsStore.animals.length === 0) {
      await animalsStore.fetchAll()
    }
  } catch {
    error.value = t('common.error')
  } finally {
    loading.value = false
  }
  // Load treatments, issues, repro in background (skip if module disabled)
  if (animal.value) {
    if (featureFlagsStore.flags.treatments && authStore.hasPermission('can_log_treatments')) {
      treatmentsStore.fetchByCow(animal.value.id)
    }
    if (featureFlagsStore.flags.healthIssues && authStore.hasPermission('can_log_issues')) {
      healthIssuesStore.fetchByCow(animal.value.id)
    }
    if (featureFlagsStore.flags.breeding && authStore.hasPermission('can_log_breeding')) {
      if (animal.value.sex !== 'male') {
        reproLoading.value = true
        breedingEventsStore
          .fetchForCow(animal.value.id)
          .then((events) => {
            latestReproEvent.value = breedingEventsStore.latestForCow(animal.value.id, events)
          })
          .finally(() => {
            reproLoading.value = false
          })
      }
      // Check for incomplete offspring from birth events where this animal is the dam
      api
        .get('/breeding-events', { params: { animal_id: animal.value.id } })
        .then(({ data }) => {
          const birthEvents = data.filter(
            (e) => ['calving', 'lambing'].includes(e.event_type) && (e.offspring_count ?? 1) > 1
          )
          if (birthEvents.length) {
            // Use the most recent birth event
            latestBirthEvent.value = birthEvents.sort((a, b) =>
              b.event_date.localeCompare(a.event_date)
            )[0]
          }
        })
        .catch(() => {
          /* non-critical */
        })
    }
  }
}

onMounted(() => {
  load()
  if (featureFlagsStore.flags.healthIssues && !issueTypesStore.hasData) issueTypesStore.fetchAll()
  if (!breedTypesStore.hasData) breedTypesStore.fetchActive().catch(() => {})
})

function calcAge(dob) {
  if (!dob) return '—'
  const diff = Date.now() - new Date(dob).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 30) return `${days} ${t('common.days')}`
  const months = Math.floor(days / 30)
  if (months < 24) return `${months} ${t('common.months')}`
  return `${Math.floor(months / 12)} ${t('common.years')}`
}

function firstMedName(tx) {
  if (tx.medications && tx.medications.length) return tx.medications[0].medication_name
  return tx.medication_name || '—'
}

function confirmDelete() {
  showDeleteDialog.value = true
}

async function handleDelete() {
  deleting.value = true
  try {
    await animalsStore.remove(animal.value.id)
    router.push('/animals')
  } catch {
    error.value = t('common.error')
    showDeleteDialog.value = false
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.center-spinner {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.error-state {
  text-align: center;
  padding: 24px;
  color: var(--danger);
}

/* Hero */
.animal-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 16px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

.animal-avatar-lg {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sex-female {
  background: var(--sex-female-bg);
  color: var(--sex-female-border, #d97dbf);
}
.sex-male {
  background: var(--sex-male-bg);
  color: var(--sex-male-border, #7db9d9);
}

.animal-hero-tag {
  font-size: 0.875rem;
  color: var(--primary);
  font-weight: 600;
  margin-bottom: 2px;
}

.animal-hero-name {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 6px;
}

.hero-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* Info card */
.info-card {
  margin-bottom: 12px;
}

.section-label {
  display: block;
  margin-bottom: 12px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.info-value {
  font-size: 0.9375rem;
  font-weight: 500;
}

.info-notes {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* Lineage */
.lineage-card {
  margin-bottom: 12px;
}

.lineage-tree {
  display: flex;
  align-items: center;
  gap: 8px;
}

.parent-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.parent-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
  transition: background 0.1s;
}

.parent-card.sire {
  background: var(--sex-male-bg);
  border-color: var(--sex-male-border);
  color: var(--sex-male-border, #7db9d9);
}
.parent-card.dam {
  background: var(--sex-female-bg);
  border-color: var(--sex-female-border);
  color: var(--sex-female-border, #d97dbf);
}
.parent-card.unknown {
  background: var(--surface-2);
  opacity: 0.7;
}

.parent-role {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.parent-name {
  font-size: 0.875rem;
  font-weight: 600;
}

.unknown-text {
  color: var(--text-muted);
  font-style: italic;
}

.lineage-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
}

.connector-line {
  width: 2px;
  height: 40px;
  background: var(--border-strong);
}

.connector-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
}

.this-animal-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 12px;
  background: var(--primary-bg);
  border-radius: var(--radius);
  border: 1.5px solid var(--primary);
  color: var(--primary);
  flex-shrink: 0;
}

.this-tag {
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--primary);
}

/* Offspring */
.incomplete-offspring-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: color-mix(in srgb, var(--warning) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-bottom: 10px;
  font-size: 0.8125rem;
  color: var(--text);
}

.register-remaining-link {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
  white-space: nowrap;
}

.no-offspring {
  font-size: 0.875rem;
  color: var(--text-muted);
  padding: 8px 0;
}

.offspring-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.offspring-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
  font-size: 0.9375rem;
  transition: background 0.1s;
}

.offspring-item:last-child {
  border-bottom: none;
}

.offspring-tag {
  font-size: 0.8125rem;
  color: var(--primary);
  font-weight: 600;
}

.offspring-name {
  flex: 1;
  font-weight: 500;
}

.offspring-chevron {
  color: var(--text-muted);
}

/* Actions */
.action-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.action-row > * {
  flex: 1;
}

.edit-link {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-danger--flex {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.offspring-icon {
  flex-shrink: 0;
}

/* Treatment History */
.treatment-card {
  margin-bottom: 12px;
}

.treatment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.treatment-header .section-label {
  margin-bottom: 0;
}

.view-all-link {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
}

.spinner-mini {
  display: flex;
  justify-content: center;
  padding: 12px;
}

.withdrawal-active-badge {
  background: var(--danger-light);
  border: 1.5px solid rgba(220, 38, 38, 0.3);
  color: var(--danger);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.treatment-summary-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-top: 1px solid var(--border);
  margin-top: 8px;
  text-decoration: none;
  color: var(--text);
  gap: 8px;
}

.tx-summary-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.tx-summary-last-med {
  font-weight: 600;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tx-summary-meta {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.tx-summary-chevron {
  color: var(--primary);
  font-size: 1.25rem;
  font-weight: 600;
  flex-shrink: 0;
}
</style>
