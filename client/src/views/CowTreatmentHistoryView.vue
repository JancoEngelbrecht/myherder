<template>
  <div class="page">
    <AppHeader :title="cow ? cow.tag_number : ''" :show-back="true" :back-to="`/cows/${cowId}`" />

    <div class="page-content">
      <div v-if="loading" class="center-spinner">
        <div class="spinner" />
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="btn-secondary" style="width: auto; margin-top: 8px" @click="load">
          {{ t('common.retry') }}
        </button>
      </div>

      <template v-else>
        <div class="list-header">
          <h2 class="list-title">{{ t('cowDetail.treatments') }}</h2>
          <RouterLink :to="`/log/treatment?cow_id=${cowId}`" class="btn-primary btn-sm-pill">
            + {{ t('cowDetail.logTreatment') }}
          </RouterLink>
        </div>

        <!-- On withdrawal badge (females only) -->
        <div v-if="onWithdrawal" class="withdrawal-active-badge">
          🚫 {{ t('cowDetail.onWithdrawal') }}
          <span class="mono">{{ formatDateTime(cowWithdrawalEnd) }}</span>
        </div>

        <div v-if="cowTreatments.length === 0" class="empty-state">
          <p class="empty-state-text">{{ t('cowDetail.noTreatments') }}</p>
        </div>

        <div v-else class="card treatment-list-card">
          <RouterLink
            v-for="tx in cowTreatments"
            :key="tx.id"
            :to="`/treatments/${tx.id}`"
            class="treatment-item"
          >
            <div class="tx-top">
              <span class="tx-date mono">{{ formatDate(tx.treatment_date) }}</span>
              <div class="tx-top-right">
                <span v-if="tx.administered_by_name" class="tx-detail">{{
                  tx.administered_by_name
                }}</span>
                <span class="tx-chevron">›</span>
              </div>
            </div>
            <!-- Multiple medications (new format) -->
            <template v-if="tx.medications && tx.medications.length">
              <div v-for="med in tx.medications" :key="med.medication_id" class="tx-med-row">
                <span class="tx-med">{{ med.medication_name }}</span>
                <span v-if="med.dosage" class="tx-dosage mono">{{ med.dosage }}</span>
              </div>
            </template>
            <!-- Fallback for old single-medication records -->
            <template v-else>
              <div class="tx-med-row">
                <span class="tx-med">{{ tx.medication_name }}</span>
                <span v-if="tx.dosage" class="tx-dosage mono">{{ tx.dosage }}</span>
              </div>
            </template>
            <div
              v-if="
                cow?.sex !== 'male' &&
                lifePhase !== 'heifer' &&
                lifePhase !== 'calf' &&
                tx.withdrawal_end_milk &&
                new Date(tx.withdrawal_end_milk) > new Date()
              "
              class="tx-withdrawal"
            >
              🥛 {{ t('cowDetail.milkClear') }}:
              <span class="mono">{{ formatDateTime(tx.withdrawal_end_milk) }}</span>
            </div>
          </RouterLink>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCowsStore, computeLifePhase } from '../stores/cows.js'
import { useTreatmentsStore } from '../stores/treatments.js'
import { useBreedTypesStore } from '../stores/breedTypes.js'
import { formatDate, formatDateTime } from '../utils/format.js'
import AppHeader from '../components/organisms/AppHeader.vue'

const { t } = useI18n()
const route = useRoute()
const cowsStore = useCowsStore()
const treatmentsStore = useTreatmentsStore()
const breedTypesStore = useBreedTypesStore()

// UUID — keep as string
const cowId = route.params.id
const cow = ref(null)
const loading = ref(true)
const error = ref('')

const cowTreatments = computed(() => treatmentsStore.getCowTreatments(cowId))

const lifePhase = computed(() => {
  if (!cow.value) return null
  const bt = cow.value.breed_type_id ? breedTypesStore.getById(cow.value.breed_type_id) : null
  return computeLifePhase(cow.value, bt)
})

const onWithdrawal = computed(() => {
  if (cow.value?.sex === 'male') return false
  if (lifePhase.value === 'heifer' || lifePhase.value === 'calf') return false
  const now = new Date()
  return cowTreatments.value.some(
    (tx) => tx.withdrawal_end_milk && new Date(tx.withdrawal_end_milk) > now
  )
})

const cowWithdrawalEnd = computed(() => {
  if (cow.value?.sex === 'male') return null
  if (lifePhase.value === 'heifer' || lifePhase.value === 'calf') return null
  const now = new Date()
  const dates = cowTreatments.value
    .filter((tx) => tx.withdrawal_end_milk && new Date(tx.withdrawal_end_milk) > now)
    .map((tx) => new Date(tx.withdrawal_end_milk))
  if (!dates.length) return null
  return new Date(Math.max(...dates.map((d) => d.getTime())))
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    cow.value = await cowsStore.fetchOne(cowId)
    await treatmentsStore.fetchByCow(cowId)
  } catch {
    error.value = t('common.error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
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

.empty-state-text {
  font-size: 0.875rem;
  color: var(--text-muted);
  padding: 8px 0;
}

.treatment-list-card {
  padding: 0 16px;
}

.treatment-item {
  display: block;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
}

.treatment-item:last-child {
  border-bottom: none;
}

.tx-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.tx-top-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tx-date {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.tx-detail {
  font-size: 0.8rem;
  color: var(--text-secondary, #555);
}

.tx-chevron {
  color: var(--primary);
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1;
}

.tx-med-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 3px;
}

.tx-med {
  font-weight: 600;
  font-size: 0.9rem;
}

.tx-dosage {
  font-size: 0.78rem;
  color: var(--text-secondary, #555);
}

.tx-withdrawal {
  font-size: 0.8rem;
  color: var(--danger);
  margin-top: 4px;
}
</style>
