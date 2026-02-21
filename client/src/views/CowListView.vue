<template>
  <div class="page">
    <AppHeader :title="t('cows.title')" />

    <div class="page-content">
      <!-- Search -->
      <div class="search-bar">
        <SearchInput
          v-model="searchQuery"
          :placeholder="t('cows.searchPlaceholder')"
          @update:model-value="onSearch"
        />
      </div>

      <!-- Status filter chips -->
      <div class="filter-chips">
        <button
          v-for="f in filters"
          :key="f.value"
          class="chip"
          :class="{ active: activeFilter === f.value }"
          @click="setFilter(f.value)"
        >
          {{ t(f.labelKey) }}
        </button>
      </div>

      <!-- Loading -->
      <div v-if="cowsStore.loading" class="center-spinner">
        <div class="spinner" />
      </div>

      <!-- Error -->
      <div v-else-if="cowsStore.error" class="error-state">
        <p>{{ cowsStore.error }}</p>
        <button class="btn-secondary" style="width:auto;margin-top:8px" @click="loadCows">{{ t('common.retry') }}</button>
      </div>

      <!-- Empty state -->
      <div v-else-if="cowsStore.cows.length === 0" class="empty-state">
        <div class="empty-state-icon">🐄</div>
        <div class="empty-state-title">{{ t('cows.emptyTitle') }}</div>
        <div class="empty-state-subtitle">{{ t('cows.emptySubtitle') }}</div>
      </div>

      <!-- List -->
      <div v-else class="cow-list">
        <CowCard v-for="cow in cowsStore.cows" :key="cow.id" :cow="cow" />
      </div>

      <!-- Pagination -->
      <PaginationBar
        :total="cowsStore.total"
        :page="page"
        :limit="limit"
        @update:page="onPageChange"
        @update:limit="onLimitChange"
      />
    </div>

    <!-- FAB -->
    <button v-if="authStore.canManageCows" class="fab" :title="t('cows.addCow')" @click="router.push('/cows/new')">
      +
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCowsStore } from '../stores/cows.js'
import { useAuthStore } from '../stores/auth.js'
import AppHeader from '../components/organisms/AppHeader.vue'
import CowCard from '../components/organisms/CowCard.vue'
import SearchInput from '../components/atoms/SearchInput.vue'
import PaginationBar from '../components/atoms/PaginationBar.vue'

const { t } = useI18n()
const router = useRouter()
const cowsStore = useCowsStore()
const authStore = useAuthStore()

const searchQuery = ref('')
const activeFilter = ref('')
const page = ref(1)
const limit = ref(20)

const filters = [
  { value: '',          labelKey: 'cows.filterAll' },
  { value: 'active',    labelKey: 'cows.filterActive' },
  { value: 'dry',       labelKey: 'cows.filterDry' },
  { value: 'pregnant',  labelKey: 'cows.filterPregnant' },
  { value: 'sick',      labelKey: 'cows.filterSick' },
  { value: 'sold',      labelKey: 'cows.filterSold' },
  { value: 'dead',      labelKey: 'cows.filterDead' },
]

function loadCows() {
  const params = { page: page.value, limit: limit.value }
  if (searchQuery.value) params.search = searchQuery.value
  if (activeFilter.value) params.status = activeFilter.value
  cowsStore.fetchAll(params)
}

function onSearch() {
  page.value = 1
  loadCows()
}

function setFilter(value) {
  activeFilter.value = value
  page.value = 1
  loadCows()
}

function onPageChange(p) {
  page.value = p
  loadCows()
}

function onLimitChange(l) {
  limit.value = l
  page.value = 1
  loadCows()
}

loadCows()
</script>

<style scoped>
.search-bar {
  margin-bottom: 12px;
}

.filter-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 16px;
  scrollbar-width: none;
}

.filter-chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 0.8125rem;
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

.center-spinner {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.error-state {
  text-align: center;
  padding: 24px;
  color: var(--danger);
  font-size: 0.9375rem;
}

.cow-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

@media (min-width: 600px) {
  .cow-list {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
}
</style>
