<template>
  <div class="page">
    <AppHeader :title="t('milkHistory.title')" show-back back-to="/milk" />

    <div class="page-content">
      <!-- Filter chips -->
      <div class="filter-chips">
        <!-- Time range -->
        <button
          v-for="opt in TIME_RANGE_OPTIONS"
          :key="opt.value"
          class="chip"
          :class="{ active: selectedRange === opt.value }"
          @click="selectedRange = opt.value"
        >
          {{ t(opt.labelKey) }}
        </button>

        <!-- Session filter -->
        <button
          class="chip"
          :class="{ active: sessionFilter === null }"
          @click="sessionFilter = null"
        >
          {{ t('milkHistory.filterAll') }}
        </button>
        <button
          v-for="s in sessions"
          :key="s"
          class="chip"
          :class="{ active: sessionFilter === s }"
          @click="sessionFilter = s"
        >
          {{ t(`milkHistory.${s}`) }}
        </button>
      </div>

      <!-- Summary bar -->
      <div v-if="!loading && total > 0" class="summary-bar">
        {{ t('milkHistory.summaryCount', { count: total }) }} &bull;
        {{ t('milkHistory.summaryLitres', { litres: totalLitres }) }}
      </div>

      <!-- Loading -->
      <div v-if="loading && records.length === 0" class="empty-state">
        <span class="spinner" />
        <p>{{ t('common.loading') }}</p>
      </div>

      <!-- Empty -->
      <div v-else-if="!loading && records.length === 0" class="empty-state">
        <p>{{ t('milkHistory.noRecords') }}</p>
      </div>

      <!-- Record list -->
      <div v-else class="record-list">
        <MilkRecordCard
          v-for="rec in records"
          :key="rec.id"
          :record="rec"
        />
      </div>

      <!-- Load more -->
      <div v-if="hasMore && !loading" class="load-more-row">
        <button class="btn-secondary load-more-btn" @click="loadMore">
          {{ t('milkHistory.loadMore') }}
        </button>
      </div>

      <!-- Loading indicator for load-more -->
      <div v-if="loading && records.length > 0" class="load-more-row">
        <span class="spinner" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../components/organisms/AppHeader.vue'
import MilkRecordCard from '../components/molecules/MilkRecordCard.vue'
import { useTimeRange, TIME_RANGE_OPTIONS } from '../composables/useAnalytics'
import api from '../services/api'
import { extractApiError } from '../utils/apiError'
import { useToast } from '../composables/useToast'

const { t } = useI18n()
const toast = useToast()

const sessions = ['morning', 'afternoon', 'evening']

const { selectedRange, dateRange } = useTimeRange(3)
const sessionFilter = ref(null)

const records = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const PAGE_SIZE = 25

const hasMore = computed(() => records.value.length < total.value)
const totalLitres = computed(() => {
  const sum = records.value.reduce((acc, r) => acc + Number(r.litres), 0)
  return Math.round(sum * 100) / 100
})

async function fetchRecords(resetList = true) {
  loading.value = true
  try {
    const params = {
      page: page.value,
      limit: PAGE_SIZE,
      from: dateRange.value.from,
      to: dateRange.value.to,
      sort: 'recording_date',
      order: 'desc',
    }
    if (sessionFilter.value) params.session = sessionFilter.value

    const { data } = await api.get('/milk-records', { params })
    if (resetList) {
      records.value = data.data
    } else {
      records.value = [...records.value, ...data.data]
    }
    total.value = data.total
  } catch (err) {
    toast.show(extractApiError(err), 'error')
  } finally {
    loading.value = false
  }
}

function loadMore() {
  page.value++
  fetchRecords(false)
}

// Reset and re-fetch when filters change
watch([dateRange, sessionFilter], () => {
  page.value = 1
  fetchRecords(true)
})

onMounted(() => fetchRecords())
</script>

<style scoped>
.page-content {
  padding-top: calc(var(--header-height) + 0.5rem);
  padding-bottom: calc(var(--nav-height) + 2rem);
}

.summary-bar {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
}

.load-more-row {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.load-more-btn {
  width: auto;
  padding: 0.5rem 2rem;
}
</style>
