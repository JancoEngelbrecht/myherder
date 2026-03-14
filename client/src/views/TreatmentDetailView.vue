<template>
  <div class="page">
    <AppHeader
      :title="t('treatmentDetail.title')"
      :show-back="true"
    />

    <div class="page-content">
      <div v-if="loading" class="center-spinner">
        <div class="spinner" />
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="btn-secondary" style="width:auto;margin-top:8px" @click="load">{{ t('common.retry') }}</button>
      </div>

      <template v-else-if="treatment">
        <!-- Date & cow -->
        <div class="card">
          <div class="detail-date mono">{{ formatDateTime(treatment.treatment_date) }}</div>
          <RouterLink :to="`/cows/${treatment.cow_id}`" class="cow-row">
            <span class="cow-emoji">🐄</span>
            <div class="cow-info">
              <span class="cow-tag mono">{{ treatment.tag_number }}</span>
              <span class="cow-name">{{ treatment.cow_name || '—' }}</span>
            </div>
            <span class="cow-chevron">›</span>
          </RouterLink>
        </div>

        <!-- Medications -->
        <div class="card">
          <h3 class="section-label">{{ t('treatments.medications') }}</h3>
          <template v-if="treatment.medications && treatment.medications.length">
            <div v-for="med in treatment.medications" :key="med.medication_id" class="med-row">
              <span class="med-name">{{ med.medication_name }}</span>
              <span v-if="med.dosage" class="med-dosage mono">{{ med.dosage }}</span>
            </div>
          </template>
          <template v-else>
            <div class="med-row">
              <span class="med-name">{{ treatment.medication_name }}</span>
              <span v-if="treatment.dosage" class="med-dosage mono">{{ treatment.dosage }}</span>
            </div>
          </template>
        </div>

        <!-- Withdrawal (only if applicable) -->
        <div v-if="treatment.withdrawal_end_milk || treatment.withdrawal_end_meat" class="card">
          <h3 class="section-label">{{ t('treatmentDetail.withdrawal') }}</h3>
          <div v-if="treatment.withdrawal_end_milk" class="withdrawal-row" :class="{ active: isMilkActive }">
            🥛 {{ t('cowDetail.milkClear') }}:
            <span class="mono">{{ formatDateTime(treatment.withdrawal_end_milk) }}</span>
            <span v-if="isMilkActive" class="active-tag">{{ t('treatmentDetail.active') }}</span>
          </div>
          <div v-if="treatment.withdrawal_end_meat" class="withdrawal-row" :class="{ active: isMeatActive }">
            🥩 {{ t('treatments.meatClear') }}:
            <span class="mono">{{ formatDateTime(treatment.withdrawal_end_meat) }}</span>
            <span v-if="isMeatActive" class="active-tag">{{ t('treatmentDetail.active') }}</span>
          </div>
        </div>

        <!-- Details -->
        <div class="card">
          <h3 class="section-label">{{ t('treatmentDetail.details') }}</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">{{ t('treatmentDetail.administeredBy') }}</span>
              <span class="detail-value">{{ treatment.administered_by_name }}</span>
            </div>
            <div v-if="treatment.cost != null" class="detail-item">
              <span class="detail-label">{{ t('treatments.cost') }}</span>
              <span class="detail-value mono">R{{ Number(treatment.cost).toFixed(2) }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">{{ t('treatments.isVetVisit') }}</span>
              <span class="detail-value">{{ treatment.is_vet_visit ? t('common.yes') : t('common.no') }}</span>
            </div>
            <div v-if="treatment.vet_name" class="detail-item">
              <span class="detail-label">{{ t('treatments.vetName') }}</span>
              <span class="detail-value">{{ treatment.vet_name }}</span>
            </div>
          </div>
          <div v-if="treatment.notes" class="detail-notes">
            <span class="detail-label">{{ t('common.notes') }}</span>
            <p class="notes-text">{{ treatment.notes }}</p>
          </div>
        </div>

        <!-- Admin delete -->
        <div v-if="authStore.isAdmin" class="action-row">
          <button class="btn-danger" @click="confirmDelete">
            🗑 {{ t('common.delete') }}
          </button>
        </div>
      </template>
    </div>

    <ConfirmDialog
      :show="showDeleteDialog"
      :message="t('treatmentDetail.deleteConfirm')"
      :confirm-label="t('cowDetail.deleteYes')"
      :cancel-label="t('cowDetail.deleteNo')"
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
import { useTreatmentsStore } from '../stores/treatments.js'
import { useAuthStore } from '../stores/auth.js'
import { formatDateTime } from '../utils/format.js'
import AppHeader from '../components/organisms/AppHeader.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const treatmentsStore = useTreatmentsStore()
const authStore = useAuthStore()

const treatment = ref(null)
const loading = ref(true)
const error = ref('')
const showDeleteDialog = ref(false)
const deleting = ref(false)

const isMilkActive = computed(
  () => treatment.value?.withdrawal_end_milk && new Date(treatment.value.withdrawal_end_milk) > new Date(),
)
const isMeatActive = computed(
  () => treatment.value?.withdrawal_end_meat && new Date(treatment.value.withdrawal_end_meat) > new Date(),
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    treatment.value = await treatmentsStore.fetchOne(route.params.id)
  } catch {
    error.value = t('common.error')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function confirmDelete() {
  showDeleteDialog.value = true
}

async function handleDelete() {
  deleting.value = true
  try {
    await treatmentsStore.remove(route.params.id)
    router.back()
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

/* Date + cow card */
.detail-date {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}

.cow-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
}

.cow-emoji {
  font-size: 1.25rem;
}

.cow-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
}

.cow-tag {
  font-size: 0.8rem;
  color: var(--primary);
  font-weight: 600;
}

.cow-name {
  font-size: 0.9rem;
  font-weight: 500;
}

.cow-chevron {
  color: var(--primary);
  font-size: 1.1rem;
  font-weight: 600;
}

/* Medications */
.section-label {
  display: block;
  margin-bottom: 10px;
}

.med-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}

.med-row:last-child {
  border-bottom: none;
}

.med-name {
  font-weight: 600;
  font-size: 0.9rem;
  flex: 1;
}

.med-dosage {
  font-size: 0.78rem;
  color: var(--text-secondary, #555);
}

/* Withdrawal */
.withdrawal-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  font-size: 0.875rem;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border);
}

.withdrawal-row:last-child {
  border-bottom: none;
}

.withdrawal-row.active {
  color: var(--danger);
}

.active-tag {
  background: var(--danger-light);
  border: 1px solid rgba(220, 38, 38, 0.3);
  color: var(--danger);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}

/* Details grid */
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 4px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.detail-value {
  font-size: 0.9rem;
  font-weight: 500;
}

.detail-notes {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notes-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* Actions */
.action-row {
  margin-top: 8px;
}

.action-row > * {
  width: 100%;
}

</style>
