<template>
  <div class="page">
    <AppHeader :title="t('cows.title')" />

    <div class="page-content">
      <!-- Search -->
      <div data-tour="cow-search" class="search-bar">
        <SearchInput
          v-model="searchQuery"
          :placeholder="t('cows.searchPlaceholder')"
          @update:model-value="onSearch"
        />
      </div>

      <!-- Status filter chips -->
      <div data-tour="cow-filters" class="filter-chips filter-chips-wrap">
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

      <!-- Advanced filters toggle -->
      <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">
        {{ t('cows.advancedFilters') }}
        <span v-if="advancedFilterCount > 0" class="filter-badge">{{ advancedFilterCount }}</span>
        <span class="toggle-arrow" :class="{ open: showAdvanced }">&#9662;</span>
      </button>

      <div v-if="showAdvanced" class="advanced-filters">
        <!-- Herd group -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('cows.filterGroupHerd') }}</span>
          <div class="filter-chips filter-chips-wrap">
            <button class="chip" :class="{ active: sexFilter === '' }" @click="setSexFilter('')">{{ t('cows.filterAll') }}</button>
            <button class="chip" :class="{ active: sexFilter === 'female' }" @click="setSexFilter('female')">{{ t('cows.filterFemale') }}</button>
            <button class="chip" :class="{ active: sexFilter === 'male' }" @click="setSexFilter('male')">{{ t('cows.filterMale') }}</button>
          </div>
          <select v-model="breedFilter" class="form-select filter-select" @change="onAdvancedChange">
            <option value="">{{ t('cows.filterAllBreeds') }}</option>
            <option v-for="bt in breedTypesStore.activeTypes" :key="bt.id" :value="bt.id">{{ bt.name }}</option>
          </select>
          <div class="filter-chips filter-chips-wrap">
            <button
              v-for="f in lifePhaseFilters"
              :key="f.value"
              class="chip"
              :class="{ active: lifePhaseFilter === f.value }"
              @click="setLifePhaseFilter(f.value)"
            >{{ t(f.labelKey) }}</button>
          </div>
        </div>

        <div class="filter-divider" />

        <!-- Breeding group -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('cows.filterGroupBreeding') }}</span>
          <div class="filter-chips filter-chips-wrap">
            <button class="chip" :class="{ active: pregnantFilter === '' }" @click="setPregnantFilter('')">{{ t('cows.filterAll') }}</button>
            <button class="chip" :class="{ active: pregnantFilter === 'true' }" @click="setPregnantFilter('true')">{{ t('cows.filterPregnant') }}</button>
            <button class="chip" :class="{ active: pregnantFilter === 'false' }" @click="setPregnantFilter('false')">{{ t('cows.filterNotPregnant') }}</button>
          </div>
          <div>
            <button class="chip chip-accent" :class="{ active: readyToBreed }" @click="readyToBreed = !readyToBreed">
              {{ t('cows.filterReadyToBreed') }}
            </button>
          </div>
        </div>

        <div class="filter-divider" />

        <!-- Production group -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('cows.filterGroupProduction') }}</span>
          <div class="filter-range-row">
            <span class="filter-label">{{ t('cows.filterDIM') }}</span>
            <div class="filter-range-inputs">
              <input v-model.number="dimMin" type="number" min="0" class="form-input filter-num-input" :placeholder="t('cows.filterYieldMin')" @change="onAdvancedChange" />
              <span class="filter-sep">–</span>
              <input v-model.number="dimMax" type="number" min="0" class="form-input filter-num-input" :placeholder="t('cows.filterYieldMax')" @change="onAdvancedChange" />
            </div>
          </div>
          <div class="filter-range-row">
            <span class="filter-label">{{ t('cows.filterMilkYield') }}</span>
            <div class="filter-range-inputs">
              <input v-model.number="yieldMin" type="number" min="0" step="0.5" class="form-input filter-num-input" :placeholder="t('cows.filterYieldMin')" @change="onAdvancedChange" />
              <span class="filter-sep">–</span>
              <input v-model.number="yieldMax" type="number" min="0" step="0.5" class="form-input filter-num-input" :placeholder="t('cows.filterYieldMax')" @change="onAdvancedChange" />
            </div>
          </div>
          <div class="filter-range-row">
            <span class="filter-label">{{ t('cows.filterCalvingDate') }}</span>
            <div class="filter-range-inputs">
              <input v-model="calvingAfter" type="date" class="form-input filter-date-input" @change="onAdvancedChange" />
              <span class="filter-sep">–</span>
              <input v-model="calvingBefore" type="date" class="form-input filter-date-input" @change="onAdvancedChange" />
            </div>
          </div>
        </div>
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
      <div v-else-if="displayedCows.length === 0" class="empty-state">
        <div class="empty-state-icon">🐄</div>
        <div class="empty-state-title">{{ t('cows.emptyTitle') }}</div>
        <div class="empty-state-subtitle">{{ t('cows.emptySubtitle') }}</div>
      </div>

      <!-- List -->
      <div v-else data-tour="cow-cards" class="cow-list">
        <template v-if="readyToBreed">
          <p class="ready-to-breed-note">{{ t('cows.readyToBreedNote') }} ({{ displayedCows.length }} / {{ cowsStore.cows.length }})</p>
        </template>
        <CowCard v-for="cow in displayedCows" :key="cow.id" :cow="cow" />
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
    <button v-if="authStore.canManageCows" data-tour="cow-add" class="fab" :title="t('cows.addCow')" @click="router.push('/cows/new')">
      +
    </button>

    <TourButton above-fab @start-tour="startTour" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCowsStore, computeIsReadyToBreed } from '../stores/cows.js'
import { useAuthStore } from '../stores/auth.js'
import { useBreedTypesStore } from '../stores/breedTypes.js'
import AppHeader from '../components/organisms/AppHeader.vue'
import CowCard from '../components/organisms/CowCard.vue'
import SearchInput from '../components/atoms/SearchInput.vue'
import PaginationBar from '../components/atoms/PaginationBar.vue'
import TourButton from '../components/atoms/TourButton.vue'
import { useTour } from '../composables/useTour.js'

const { t } = useI18n()
const router = useRouter()
const cowsStore = useCowsStore()
const authStore = useAuthStore()
const breedTypesStore = useBreedTypesStore()

const searchQuery = ref('')
const activeFilter = ref('')
const sexFilter = ref('')
const breedFilter = ref('')
const lifePhaseFilter = ref('')
const readyToBreed = ref(false)
const pregnantFilter = ref('')
const dimMin = ref(null)
const dimMax = ref(null)
const calvingAfter = ref('')
const calvingBefore = ref('')
const yieldMin = ref(null)
const yieldMax = ref(null)
const showAdvanced = ref(false)
const page = ref(1)
const limit = ref(20)

if (!breedTypesStore.hasData) breedTypesStore.fetchActive()

const { startTour } = useTour('cow-list', () => [
  {
    element: '[data-tour="cow-search"]',
    popover: {
      title: t('tour.cowList.search.title'),
      description: t('tour.cowList.search.desc'),
    }
  },
  {
    element: '[data-tour="cow-filters"]',
    popover: {
      title: t('tour.cowList.filters.title'),
      description: t('tour.cowList.filters.desc'),
    }
  },
  {
    element: '[data-tour="cow-cards"]',
    popover: {
      title: t('tour.cowList.cowCard.title'),
      description: t('tour.cowList.cowCard.desc'),
    }
  },
  {
    element: '[data-tour="cow-add"]',
    popover: {
      title: t('tour.cowList.addBtn.title'),
      description: t('tour.cowList.addBtn.desc'),
    }
  },
])

const filters = [
  { value: '',          labelKey: 'cows.filterAll' },
  { value: 'active',    labelKey: 'cows.filterActive' },
  { value: 'dry',       labelKey: 'cows.filterDry' },
  { value: 'pregnant',  labelKey: 'cows.filterPregnant' },
  { value: 'sick',      labelKey: 'cows.filterSick' },
  { value: 'sold',      labelKey: 'cows.filterSold' },
  { value: 'dead',      labelKey: 'cows.filterDead' },
]

const lifePhaseFilters = [
  { value: '',           labelKey: 'cows.filterAllPhases' },
  { value: 'calf',       labelKey: 'lifePhase.calf' },
  { value: 'heifer',     labelKey: 'lifePhase.heifer' },
  { value: 'cow',        labelKey: 'lifePhase.cow' },
  { value: 'young_bull', labelKey: 'lifePhase.young_bull' },
  { value: 'bull',       labelKey: 'lifePhase.bull' },
]

// Client-side filter for "Ready to Breed" — uses last_calving_date from API response
const displayedCows = computed(() => {
  if (!readyToBreed.value) return cowsStore.cows
  return cowsStore.cows.filter(cow => {
    const breed = breedTypesStore.activeTypes.find(b => b.id === cow.breed_type_id) ?? null
    return computeIsReadyToBreed(cow, breed, cow.last_calving_date ?? null)
  })
})

const advancedFilterCount = computed(() => {
  let n = 0
  if (sexFilter.value) n++
  if (breedFilter.value) n++
  if (lifePhaseFilter.value) n++
  if (pregnantFilter.value) n++
  if (readyToBreed.value) n++
  if (dimMin.value != null && dimMin.value !== '') n++
  if (dimMax.value != null && dimMax.value !== '') n++
  if (calvingAfter.value) n++
  if (calvingBefore.value) n++
  if (yieldMin.value != null && yieldMin.value !== '') n++
  if (yieldMax.value != null && yieldMax.value !== '') n++
  return n
})

function loadCows() {
  const params = { page: page.value, limit: limit.value }
  if (searchQuery.value) params.search = searchQuery.value
  if (activeFilter.value) params.status = activeFilter.value
  if (sexFilter.value) params.sex = sexFilter.value
  if (breedFilter.value) params.breed_type_id = breedFilter.value
  if (lifePhaseFilter.value) params.life_phase = lifePhaseFilter.value
  if (pregnantFilter.value) params.pregnant = pregnantFilter.value
  if (dimMin.value != null && dimMin.value !== '') params.dim_min = dimMin.value
  if (dimMax.value != null && dimMax.value !== '') params.dim_max = dimMax.value
  if (calvingAfter.value) params.calving_after = calvingAfter.value
  if (calvingBefore.value) params.calving_before = calvingBefore.value
  if (yieldMin.value != null && yieldMin.value !== '') params.yield_min = yieldMin.value
  if (yieldMax.value != null && yieldMax.value !== '') params.yield_max = yieldMax.value
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

function setSexFilter(value) {
  sexFilter.value = value
  page.value = 1
  loadCows()
}

function setLifePhaseFilter(value) {
  lifePhaseFilter.value = value
  page.value = 1
  loadCows()
}

function setPregnantFilter(value) {
  pregnantFilter.value = value
  page.value = 1
  loadCows()
}

function onAdvancedChange() {
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
  margin-bottom: 16px;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0 0 12px;
}

.toggle-arrow {
  font-size: 0.7rem;
  transition: transform 0.2s;
}

.toggle-arrow.open {
  transform: rotate(180deg);
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: #fff;
  border-radius: 100px;
  font-size: 0.625rem;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
}

.advanced-filters {
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 12px;
}

.filter-group:last-child {
  padding-bottom: 4px;
}

.filter-group-title {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-secondary);
  opacity: 0.55;
}

.filter-divider {
  height: 1px;
  background: var(--border);
  margin: 0 0 12px;
}

.filter-select {
  max-width: 220px;
  font-size: 0.8125rem;
}

.filter-range-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-range-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.filter-sep {
  color: var(--text-secondary);
  font-size: 0.8rem;
  flex-shrink: 0;
}

.filter-num-input {
  width: 90px;
  font-size: 0.8125rem;
  padding: 6px 10px;
}

.filter-date-input {
  width: 140px;
  font-size: 0.8125rem;
  padding: 6px 10px;
}

.chip-accent.active {
  background: var(--warning);
  border-color: var(--warning);
  color: #fff;
}

.ready-to-breed-note {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin: 0 0 8px;
  grid-column: 1 / -1;
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
