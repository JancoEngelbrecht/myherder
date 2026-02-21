<template>
  <div class="page withdrawal-page">
    <AppHeader :title="$t('withdrawal.title')" show-back back-to="/" />

    <div class="content">
      <div v-if="!loadingWithdrawal && withdrawalCows.length > 0" class="alert-banner">
        <span class="alert-icon">🚫</span>
        <span>{{ $t('withdrawal.banner', { count: withdrawalCows.length }) }}</span>
      </div>

      <div v-if="loadingWithdrawal" class="spinner-wrap"><div class="spinner" /></div>

      <div v-else-if="withdrawalCows.length === 0" class="empty-state clear-state">
        <div class="clear-icon">✅</div>
        <h2>{{ $t('withdrawal.allClear') }}</h2>
        <p>{{ $t('withdrawal.allClearSub') }}</p>
      </div>

      <div v-else class="cow-list">
        <div v-for="item in withdrawalCows" :key="item.id" class="withdrawal-card">
          <div class="card-top">
            <div class="cow-id">
              <span class="tag-number mono">{{ item.tag_number }}</span>
              <span v-if="item.cow_name" class="cow-name">{{ item.cow_name }}</span>
            </div>
            <RouterLink :to="`/cows/${item.cow_id}`" class="view-link">
              {{ $t('common.view') }} →
            </RouterLink>
          </div>

          <div class="med-info">
            <span class="med-name">{{ item.medication_name }}</span>
          </div>

          <div class="withdrawal-row milk-row">
            <span class="wd-label">🥛 {{ $t('withdrawal.milkClear') }}</span>
            <div class="wd-right">
              <span class="wd-date mono">{{ formatDateTime(item.withdrawal_end_milk) }}</span>
              <span class="countdown-badge" :class="withdrawalInfo(item.withdrawal_end_milk).urgency">
                {{ withdrawalInfo(item.withdrawal_end_milk).label }}
              </span>
            </div>
          </div>

          <div
            v-if="item.withdrawal_end_meat && item.withdrawal_end_meat > nowIso"
            class="withdrawal-row"
          >
            <span class="wd-label">🥩 {{ $t('withdrawal.meatClear') }}</span>
            <div class="wd-right">
              <span class="wd-date mono">{{ formatDateTime(item.withdrawal_end_meat) }}</span>
            </div>
          </div>

          <div class="treatment-date">
            {{ $t('withdrawal.treated') }}: {{ formatDateTime(item.treatment_date) }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loadingWithdrawal" class="refresh-row">
      <button class="btn-secondary" @click="store.fetchWithdrawal()">{{ $t('common.refresh') }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useTreatmentsStore } from '../stores/treatments'
import { formatDateTime } from '../utils/format'
import AppHeader from '../components/organisms/AppHeader.vue'

const store = useTreatmentsStore()
const loadingWithdrawal = computed(() => store.loadingWithdrawal)
const withdrawalCows = computed(() => store.withdrawalCows)

// A stable ISO string used for template comparisons — avoids constructing new Date() inside v-if
const nowIso = new Date().toISOString()

onMounted(() => store.fetchWithdrawal())

/**
 * Returns both the countdown label and urgency CSS class for a withdrawal end date.
 * Unified so the label and style are always consistent with each other.
 */
function withdrawalInfo(endDate) {
  const diff = new Date(endDate) - Date.now()

  if (diff <= 0) return { label: '✓', urgency: 'urgency-done' }

  const hours = diff / 3_600_000
  const label = hours < 24
    ? `${Math.floor(hours)}h`
    : (() => {
        const d = Math.floor(hours / 24)
        const h = Math.floor(hours % 24)
        return h > 0 ? `${d}d ${h}h` : `${d}d`
      })()

  const urgency = hours <= 12 ? 'urgency-critical'
    : hours <= 24 ? 'urgency-high'
    : hours <= 72 ? 'urgency-medium'
    : 'urgency-low'

  return { label, urgency }
}
</script>

<style scoped>
.withdrawal-page {
  background: #fff5f5;
  min-height: 100vh;
}

.content {
  padding: 80px 16px 120px;
  max-width: 600px;
  margin: 0 auto;
}

.alert-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--danger);
  color: white;
  padding: 14px 18px;
  border-radius: var(--radius);
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 20px;
}

.alert-icon {
  font-size: 1.4rem;
}

.spinner-wrap {
  display: flex;
  justify-content: center;
  padding: 60px;
}

.clear-state {
  text-align: center;
  padding: 60px 20px;
}

.clear-icon {
  font-size: 4rem;
  margin-bottom: 16px;
}

.clear-state h2 {
  color: var(--primary);
  margin: 0 0 8px;
}

.clear-state p {
  color: var(--text-secondary);
}

.cow-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.withdrawal-card {
  background: var(--surface);
  border: 2px solid var(--danger);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: 0 2px 12px rgba(214, 40, 40, 0.12);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.cow-id {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tag-number {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--danger);
}

.cow-name {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.view-link {
  font-size: 0.85rem;
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
}

.med-info {
  margin-bottom: 12px;
}

.med-name {
  font-size: 0.9rem;
  font-weight: 600;
  background: var(--danger-light);
  color: var(--danger);
  padding: 3px 10px;
  border-radius: var(--radius-full);
}

.withdrawal-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #f5e0e0;
}

.milk-row {
  border-top: none;
}

.wd-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.wd-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wd-date {
  font-size: 0.82rem;
  color: var(--text);
}

.countdown-badge {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  min-width: 50px;
  text-align: center;
}

.urgency-critical {
  background: var(--danger);
  color: white;
  animation: pulse-red 1s ease-in-out infinite;
}

.urgency-high {
  background: #ff5722;
  color: white;
}

.urgency-medium {
  background: var(--warning);
  color: white;
}

.urgency-low {
  background: var(--warning-light);
  color: var(--warning);
}

.urgency-done {
  background: var(--success-light);
  color: var(--primary);
}

.treatment-date {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 10px;
  border-top: 1px solid #f5e0e0;
  padding-top: 8px;
}

.refresh-row {
  position: fixed;
  bottom: calc(var(--nav-height) + var(--safe-bottom) + 16px);
  left: 50%;
  transform: translateX(-50%);
  width: auto;
}

.refresh-row .btn-secondary {
  width: auto;
  padding: 10px 24px;
}

@keyframes pulse-red {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
</style>
