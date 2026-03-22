<template>
  <div class="page">
    <AppHeader :title="cow ? cow.tag_number : ''" :show-back="true" back-to="/cows" />

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

      <template v-else-if="cow">
        <!-- Hero -->
        <div class="cow-hero">
          <div class="cow-avatar-lg" :class="`sex-${cow.sex}`">
            {{ cow.sex === 'male' ? speciesEmoji.male : speciesEmoji.female }}
          </div>
          <div class="cow-hero-info">
            <div class="cow-hero-tag mono">{{ cow.tag_number }}</div>
            <div class="cow-hero-name">{{ cow.name || '—' }}</div>
            <div class="hero-badges">
              <span class="badge" :class="`badge-${cow.status}`">
                {{ t(`status.${cow.status}`) }}
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
              <span class="info-value">{{ cow.breed_type_name || cow.breed || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ t('animalDetail.dob') }}</span>
              <span class="info-value">{{ formatDate(cow.dob) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ t('animalDetail.age') }}</span>
              <span class="info-value">{{ calcAge(cow.dob) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ t('animalDetail.sex') }}</span>
              <span class="info-value">{{ t(`sex.${cow.sex}`) }}</span>
            </div>
            <div v-if="cow.sex === 'male' && cow.purpose" class="info-item">
              <span class="info-label">{{ t('animalDetail.purpose') }}</span>
              <span class="info-value">{{
                t(
                  `animalForm.purpose${cow.purpose === 'natural_service' ? 'Natural' : cow.purpose === 'ai_semen_donor' ? 'AI' : 'Both'}`
                )
              }}</span>
            </div>
            <div v-if="cow.sex === 'male' && cow.is_external" class="info-item">
              <span class="info-label">{{ t('animalDetail.external') }}</span>
              <span class="info-value">{{ t('common.yes') }}</span>
            </div>
          </div>
          <div v-if="cow.notes" class="info-notes">{{ cow.notes }}</div>
        </div>

        <!-- Lineage -->
        <div class="card lineage-card">
          <h3 class="section-label">{{ t('animalDetail.lineage') }}</h3>
          <div class="lineage-tree">
            <div class="parent-col">
              <RouterLink v-if="cow.sire_id" :to="`/cows/${cow.sire_id}`" class="parent-card sire">
                <span>{{ speciesEmoji.male }}</span>
                <div>
                  <div class="parent-role">{{ t('animalDetail.sire') }}</div>
                  <div class="parent-name">{{ cow.sire_name || '—' }}</div>
                </div>
              </RouterLink>
              <div v-else class="parent-card unknown">
                <span>{{ speciesEmoji.male }}</span>
                <div>
                  <div class="parent-role">{{ t('animalDetail.sire') }}</div>
                  <div class="parent-name unknown-text">{{ t('animalDetail.unknown') }}</div>
                </div>
              </div>

              <RouterLink v-if="cow.dam_id" :to="`/cows/${cow.dam_id}`" class="parent-card dam">
                <span>{{ speciesEmoji.female }}</span>
                <div>
                  <div class="parent-role">{{ t('animalDetail.dam') }}</div>
                  <div class="parent-name">{{ cow.dam_name || '—' }}</div>
                </div>
              </RouterLink>
              <div v-else class="parent-card unknown">
                <span>{{ speciesEmoji.female }}</span>
                <div>
                  <div class="parent-role">{{ t('animalDetail.dam') }}</div>
                  <div class="parent-name unknown-text">{{ t('animalDetail.unknown') }}</div>
                </div>
              </div>
            </div>

            <div class="lineage-connector">
              <div class="connector-line" />
              <div class="connector-dot" />
            </div>

            <div class="this-cow-card">
              <span>{{ cow.sex === 'male' ? speciesEmoji.male : speciesEmoji.female }}</span>
              <div class="mono this-tag">{{ cow.tag_number }}</div>
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
              :to="`/cows/${calf.id}`"
              class="offspring-item"
            >
              <span>{{ calf.sex === 'male' ? speciesEmoji.male : speciesEmoji.female }}</span>
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
          v-if="flags.breeding && cow.sex !== 'male' && authStore.hasPermission('can_log_breeding')"
          class="card treatment-card"
        >
          <div class="treatment-header">
            <h3 class="section-label">{{ t('breeding.reproTitle') }}</h3>
            <RouterLink :to="`/cows/${cow.id}/repro`" class="view-all-link">
              {{ t('animalDetail.viewAll') }} ›
            </RouterLink>
          </div>

          <div v-if="reproLoading" class="spinner-mini"><div class="spinner" /></div>

          <template v-if="!reproLoading">
            <RouterLink :to="`/cows/${cow.id}/repro`" class="treatment-summary-link">
              <div class="tx-summary-body">
                <div class="tx-summary-last-med">
                  <template v-if="latestReproEvent">
                    {{ getEventType(latestReproEvent.event_type)?.emoji ?? '📋' }}
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
                    · 🐮 {{ latestReproEvent.expected_calving }}
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
            <RouterLink :to="`/cows/${cow.id}/issues`" class="view-all-link">
              {{ t('animalDetail.viewAll') }} ›
            </RouterLink>
          </div>

          <div v-if="issuesLoading" class="spinner-mini"><div class="spinner" /></div>

          <template v-if="!issuesLoading">
            <div v-if="cowIssues.length === 0" class="no-offspring">
              {{ t('healthIssues.noIssues') }}
            </div>
            <RouterLink v-else :to="`/cows/${cow.id}/issues`" class="treatment-summary-link">
              <div class="tx-summary-body">
                <div class="tx-summary-last-med">
                  {{
                    (cowIssues[0].issue_types || [])
                      .map((c) => issueTypesStore.getByCode(c)?.emoji || '❓')
                      .join(' ')
                  }}
                  {{
                    (cowIssues[0].issue_types || [])
                      .map((c) => issueTypesStore.getByCode(c)?.name || c)
                      .join(' + ')
                  }}
                </div>
                <div class="tx-summary-meta mono">
                  {{ formatDate(cowIssues[0].observed_at) }}
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
            <RouterLink :to="`/cows/${cow.id}/treatments`" class="view-all-link">
              {{ t('animalDetail.viewAll') }} ›
            </RouterLink>
          </div>

          <div v-if="treatmentsLoading" class="spinner-mini"><div class="spinner" /></div>

          <!-- On withdrawal badge -->
          <div v-if="onWithdrawal" class="withdrawal-active-badge">
            🚫 {{ t('animalDetail.onWithdrawal') }}
            <span class="mono">{{ formatDateTime(cowWithdrawalEnd) }}</span>
          </div>

          <template v-if="!treatmentsLoading">
            <div v-if="cowTreatments.length === 0" class="no-offspring">
              {{ t('animalDetail.noTreatments') }}
            </div>
            <RouterLink v-else :to="`/cows/${cow.id}/treatments`" class="treatment-summary-link">
              <div class="tx-summary-body">
                <div class="tx-summary-last-med">{{ firstMedName(cowTreatments[0]) }}</div>
                <div class="tx-summary-meta mono">
                  {{ formatDate(cowTreatments[0].treatment_date) }} ·
                  {{ t('animalDetail.treatmentsCount', { count: cowTreatments.length }) }}
                </div>
              </div>
              <span class="tx-summary-chevron">›</span>
            </RouterLink>
          </template>
        </div>

        <!-- Breeding action (female cows, breeding enabled, permission required) -->
        <div
          v-if="flags.breeding && cow.sex !== 'male' && authStore.hasPermission('can_log_breeding')"
          class="action-row"
        >
          <RouterLink :to="`/breed/log?cow_id=${cow.id}`" class="btn-secondary edit-link">
            🐂 {{ t('breeding.logEvent') }}
          </RouterLink>
        </div>

        <!-- Actions -->
        <div v-if="authStore.canManageCows" class="action-row">
          <RouterLink :to="`/cows/${cow.id}/edit`" class="btn-secondary edit-link">
            ✏️ {{ t('animalDetail.edit') }}
          </RouterLink>
          <button v-if="authStore.isAdmin" class="btn-danger" @click="confirmDelete">
            🗑 {{ t('animalDetail.delete') }}
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

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCowsStore, computeLifePhase } from '../stores/cows.js'
import { useAuthStore } from '../stores/auth.js'
import { useBreedTypesStore } from '../stores/breedTypes.js'
import { useTreatmentsStore } from '../stores/treatments.js'
import { useHealthIssuesStore } from '../stores/healthIssues.js'
import { useIssueTypesStore } from '../stores/issueTypes.js'
import { useBreedingEventsStore } from '../stores/breedingEvents.js'
import { useFeatureFlagsStore } from '../stores/featureFlags.js'
import { useSpeciesTerms } from '../composables/useSpeciesTerms.js'
import { getEventType } from '../config/breedingEventTypes.js'
import { formatDate, formatDateTime } from '../utils/format.js'
import api from '../services/api.js'
import AppHeader from '../components/organisms/AppHeader.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const cowsStore = useCowsStore()
const authStore = useAuthStore()
const treatmentsStore = useTreatmentsStore()
const healthIssuesStore = useHealthIssuesStore()
const issueTypesStore = useIssueTypesStore()
const breedingEventsStore = useBreedingEventsStore()

const breedTypesStore = useBreedTypesStore()
const featureFlagsStore = useFeatureFlagsStore()
const { emoji: speciesEmoji, lifePhasesConfig } = useSpeciesTerms()

const flags = computed(() => featureFlagsStore.flags)

const cow = ref(null)
const loading = ref(true)
const error = ref('')

const lifePhase = computed(() => {
  if (!cow.value) return null
  const bt = cow.value.breed_type_id ? breedTypesStore.getById(cow.value.breed_type_id) : null
  return computeLifePhase(cow.value, bt, lifePhasesConfig.value)
})
const showDeleteDialog = ref(false)
const deleting = ref(false)
const latestReproEvent = ref(null)
const reproLoading = ref(false)
const treatmentsLoading = computed(() => treatmentsStore.loadingByCow)
const issuesLoading = computed(() => healthIssuesStore.loadingByCow)
const cowIssues = computed(() => (cow.value ? healthIssuesStore.getCowIssues(cow.value.id) : []))
const openIssueCount = computed(() => cowIssues.value.filter((i) => i.status === 'open').length)

const offspring = computed(() => {
  if (!cow.value) return []
  return cowsStore.cows.filter((c) => c.sire_id === cow.value.id || c.dam_id === cow.value.id)
})

// Incomplete offspring: birth event where offspring_count > registered
const latestBirthEvent = ref(null)
const incompleteOffspring = computed(() => {
  if (!latestBirthEvent.value) return null
  const ev = latestBirthEvent.value
  const registeredCount = cowsStore.cows.filter((c) => c.birth_event_id === ev.id).length
  if (ev.offspring_count > registeredCount) {
    return { total: ev.offspring_count, registered: registeredCount, eventId: ev.id }
  }
  return null
})
const incompleteOffspringRegisterRoute = computed(() => {
  if (!incompleteOffspring.value || !cow.value) return '/cows/new'
  const { eventId, registered, total } = incompleteOffspring.value
  return {
    path: '/cows/new',
    query: {
      birth_event_id: eventId,
      dam_id: cow.value.id,
      offspring_total: String(total),
      offspring_index: String(registered + 1),
      dob: latestBirthEvent.value?.event_date?.slice(0, 10) ?? '',
    },
  }
})

const cowTreatments = computed(() =>
  cow.value ? treatmentsStore.getCowTreatments(cow.value.id) : []
)

const onWithdrawal = computed(() => {
  if (cow.value?.sex === 'male') return false
  if (lifePhase.value === 'heifer' || lifePhase.value === 'calf') return false
  const now = new Date()
  return cowTreatments.value.some(
    (t) => t.withdrawal_end_milk && new Date(t.withdrawal_end_milk) > now
  )
})

const cowWithdrawalEnd = computed(() => {
  if (cow.value?.sex === 'male') return null
  if (lifePhase.value === 'heifer' || lifePhase.value === 'calf') return null
  const now = new Date()
  const dates = cowTreatments.value
    .filter((t) => t.withdrawal_end_milk && new Date(t.withdrawal_end_milk) > now)
    .map((t) => new Date(t.withdrawal_end_milk))
  if (!dates.length) return null
  return new Date(Math.max(...dates.map((d) => d.getTime())))
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    cow.value = await cowsStore.fetchOne(route.params.id)
    // Ensure cows list is loaded for offspring computation
    if (cowsStore.cows.length === 0) {
      await cowsStore.fetchAll()
    }
  } catch {
    error.value = t('common.error')
  } finally {
    loading.value = false
  }
  // Load treatments, issues, repro in background (skip if module disabled)
  if (cow.value) {
    if (featureFlagsStore.flags.treatments && authStore.hasPermission('can_log_treatments')) {
      treatmentsStore.fetchByCow(cow.value.id)
    }
    if (featureFlagsStore.flags.healthIssues && authStore.hasPermission('can_log_issues')) {
      healthIssuesStore.fetchByCow(cow.value.id)
    }
    if (featureFlagsStore.flags.breeding && authStore.hasPermission('can_log_breeding')) {
      if (cow.value.sex !== 'male') {
        reproLoading.value = true
        breedingEventsStore
          .fetchForCow(cow.value.id)
          .then((events) => {
            latestReproEvent.value = breedingEventsStore.latestForCow(cow.value.id, events)
          })
          .finally(() => {
            reproLoading.value = false
          })
      }
      // Check for incomplete offspring from birth events where this animal is the dam
      api
        .get('/breeding-events', { params: { cow_id: cow.value.id } })
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
    await cowsStore.remove(cow.value.id)
    router.push('/cows')
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
.cow-hero {
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

.cow-avatar-lg {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.25rem;
  flex-shrink: 0;
}

.sex-female {
  background: var(--sex-female-bg);
}
.sex-male {
  background: var(--sex-male-bg);
}

.cow-hero-tag {
  font-size: 0.875rem;
  color: var(--primary);
  font-weight: 600;
  margin-bottom: 2px;
}

.cow-hero-name {
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
  font-size: 1rem;
  text-decoration: none;
  color: var(--text);
  transition: background 0.1s;
}

.parent-card.sire {
  background: var(--sex-male-bg);
  border-color: var(--sex-male-border);
}
.parent-card.dam {
  background: var(--sex-female-bg);
  border-color: var(--sex-female-border);
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

.this-cow-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 12px;
  background: var(--primary-bg);
  border-radius: var(--radius);
  border: 1.5px solid var(--primary);
  font-size: 1.5rem;
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
