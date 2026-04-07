<template>
  <div class="page">
    <AppHeader :title="t('animals.title', { collectiveNoun })" />

    <div class="page-content">
      <!-- Search -->
      <div data-tour="animal-search" class="search-bar">
        <SearchInput
          v-model="searchQuery"
          :placeholder="t('animals.searchPlaceholder')"
          @update:model-value="onSearch"
        />
      </div>

      <!-- Status filter chips -->
      <div data-tour="animal-filters" class="filter-chips filter-chips-wrap">
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
        {{ t('animals.advancedFilters') }}
        <span v-if="advancedFilterCount > 0" class="filter-badge">{{ advancedFilterCount }}</span>
        <span class="toggle-arrow" :class="{ open: showAdvanced }">&#9662;</span>
      </button>

      <div v-if="showAdvanced" class="advanced-filters">
        <!-- Herd group -->
        <div class="filter-group">
          <span class="filter-group-title">{{
            t('animals.filterGroupHerd', { collectiveNoun })
          }}</span>
          <div class="filter-chips filter-chips-wrap">
            <button
              class="chip"
              :class="{ active: sexFilter === '' }"
              :aria-pressed="sexFilter === ''"
              @click="setSexFilter('')"
            >
              {{ t('animals.filterAll') }}
            </button>
            <button
              class="chip"
              :class="{ active: sexFilter === 'female' }"
              :aria-pressed="sexFilter === 'female'"
              @click="setSexFilter('female')"
            >
              {{ t('animals.filterFemale') }}
            </button>
            <button
              class="chip"
              :class="{ active: sexFilter === 'male' }"
              :aria-pressed="sexFilter === 'male'"
              @click="setSexFilter('male')"
            >
              {{ t('animals.filterMale') }}
            </button>
          </div>
          <select
            v-model="breedFilter"
            class="form-select filter-select"
            @change="onAdvancedChange"
          >
            <option value="">{{ t('animals.filterAllBreeds') }}</option>
            <option v-for="bt in breedTypesStore.activeTypes" :key="bt.id" :value="bt.id">
              {{ bt.name }}
            </option>
          </select>
          <div class="filter-chips filter-chips-wrap">
            <button
              v-for="f in lifePhaseFilters"
              :key="f.value"
              class="chip"
              :class="{ active: lifePhaseFilter === f.value }"
              :aria-pressed="lifePhaseFilter === f.value"
              @click="setLifePhaseFilter(f.value)"
            >
              {{ t(f.labelKey) }}
            </button>
          </div>
        </div>

        <div class="filter-divider" />

        <!-- Breeding group -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('animals.filterGroupBreeding') }}</span>
          <div class="filter-chips filter-chips-wrap">
            <button
              class="chip"
              :class="{ active: pregnantFilter === '' }"
              :aria-pressed="pregnantFilter === ''"
              @click="setPregnantFilter('')"
            >
              {{ t('animals.filterAll') }}
            </button>
            <button
              class="chip"
              :class="{ active: pregnantFilter === 'true' }"
              :aria-pressed="pregnantFilter === 'true'"
              @click="setPregnantFilter('true')"
            >
              {{ t('animals.filterPregnant') }}
            </button>
            <button
              class="chip"
              :class="{ active: pregnantFilter === 'false' }"
              :aria-pressed="pregnantFilter === 'false'"
              @click="setPregnantFilter('false')"
            >
              {{ t('animals.filterNotPregnant') }}
            </button>
          </div>
          <div>
            <button
              class="chip chip-accent"
              :class="{ active: readyToBreed }"
              :aria-pressed="readyToBreed"
              @click="readyToBreed = !readyToBreed"
            >
              {{ t('animals.filterReadyToBreed') }}
            </button>
          </div>
        </div>

        <div class="filter-divider" />

        <!-- Production group — only shown when milkRecording flag is on -->
        <div v-if="featureFlagsStore.flags.milkRecording" class="filter-group">
          <span class="filter-group-title">{{ t('animals.filterGroupProduction') }}</span>
          <div class="filter-range-row">
            <span class="filter-label">{{ t('animals.filterDIM') }}</span>
            <div class="filter-range-inputs">
              <input
                v-model.number="dimMin"
                type="number"
                min="0"
                class="form-input filter-num-input"
                :placeholder="t('animals.filterYieldMin')"
                @change="onAdvancedChange"
              />
              <span class="filter-sep">–</span>
              <input
                v-model.number="dimMax"
                type="number"
                min="0"
                class="form-input filter-num-input"
                :placeholder="t('animals.filterYieldMax')"
                @change="onAdvancedChange"
              />
            </div>
          </div>
          <div class="filter-range-row">
            <span class="filter-label">{{ t('animals.filterMilkYield') }}</span>
            <div class="filter-range-inputs">
              <input
                v-model.number="yieldMin"
                type="number"
                min="0"
                step="0.5"
                class="form-input filter-num-input"
                :placeholder="t('animals.filterYieldMin')"
                @change="onAdvancedChange"
              />
              <span class="filter-sep">–</span>
              <input
                v-model.number="yieldMax"
                type="number"
                min="0"
                step="0.5"
                class="form-input filter-num-input"
                :placeholder="t('animals.filterYieldMax')"
                @change="onAdvancedChange"
              />
            </div>
          </div>
          <div class="filter-range-row">
            <span class="filter-label">{{ t('animals.filterCalvingDate') }}</span>
            <div class="filter-range-inputs">
              <input
                v-model="calvingAfter"
                type="date"
                class="form-input filter-date-input"
                @change="onAdvancedChange"
              />
              <span class="filter-sep">–</span>
              <input
                v-model="calvingBefore"
                type="date"
                class="form-input filter-date-input"
                @change="onAdvancedChange"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="animalsStore.loading" class="center-spinner">
        <div class="spinner" />
      </div>

      <!-- Error -->
      <div v-else-if="animalsStore.error" class="error-state">
        <p>{{ animalsStore.error }}</p>
        <button class="btn-secondary" style="width: auto; margin-top: 8px" @click="loadAnimals">
          {{ t('common.retry') }}
        </button>
      </div>

      <!-- Empty state -->
      <div v-else-if="displayedAnimals.length === 0" class="empty-state">
        <div class="empty-state-icon">{{ speciesEmoji }}</div>
        <div class="empty-state-title">
          {{ t('animals.emptyTitle', { speciesPlural: plural }) }}
        </div>
        <div class="empty-state-subtitle">{{ t('animals.emptySubtitle') }}</div>
      </div>

      <!-- List -->
      <div v-else data-tour="animal-cards" class="animal-list">
        <template v-if="readyToBreed">
          <p class="ready-to-breed-note">
            {{ t('animals.readyToBreedNote') }} ({{ displayedAnimals.length }} /
            {{ animalsStore.animals.length }})
          </p>
        </template>
        <AnimalCard v-for="animal in displayedAnimals" :key="animal.id" :animal="animal" />
      </div>

      <!-- Pagination -->
      <PaginationBar
        :total="animalsStore.total"
        :page="page"
        :limit="limit"
        @update:page="onPageChange"
        @update:limit="onLimitChange"
      />
    </div>

    <!-- FAB -->
    <button
      v-if="authStore.canManageAnimals"
      data-tour="animal-add"
      class="fab"
      :title="t('animals.addAnimal', { species: singular })"
      @click="router.push('/animals/new')"
    >
      +
    </button>

    <TourButton above-fab @start-tour="startTour" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAnimalsStore, computeIsReadyToBreed } from '../stores/animals'
import { useAuthStore } from '../stores/auth'
import { useBreedTypesStore } from '../stores/breedTypes'
import { useFeatureFlagsStore } from '../stores/featureFlags'
import { useSpeciesTerms } from '../composables/useSpeciesTerms'
import AppHeader from '../components/organisms/AppHeader.vue'
import AnimalCard from '../components/organisms/AnimalCard.vue'
import SearchInput from '../components/atoms/SearchInput.vue'
import PaginationBar from '../components/atoms/PaginationBar.vue'
import TourButton from '../components/atoms/TourButton.vue'
import { useTour } from '../composables/useTour'

const { t } = useI18n()
const router = useRouter()
const animalsStore = useAnimalsStore()
const authStore = useAuthStore()
const breedTypesStore = useBreedTypesStore()
const featureFlagsStore = useFeatureFlagsStore()

const {
  singular,
  plural,
  collectiveNoun,
  emoji: speciesEmojiConfig,
  lifePhasesConfig,
} = useSpeciesTerms()

// Pick a single emoji for the animal list (prefer female)
const speciesEmoji = computed(() => speciesEmojiConfig.value?.female ?? '🐄')

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

const { startTour } = useTour('animal-list', () => [
  {
    element: '[data-tour="animal-search"]',
    popover: {
      title: t('tour.cowList.search.title'),
      description: t('tour.cowList.search.desc'),
    },
  },
  {
    element: '[data-tour="animal-filters"]',
    popover: {
      title: t('tour.cowList.filters.title'),
      description: t('tour.cowList.filters.desc'),
    },
  },
  {
    element: '[data-tour="animal-cards"]',
    popover: {
      title: t('tour.cowList.cowCard.title'),
      description: t('tour.cowList.cowCard.desc'),
    },
  },
  {
    element: '[data-tour="animal-add"]',
    popover: {
      title: t('tour.cowList.addBtn.title'),
      description: t('tour.cowList.addBtn.desc'),
    },
  },
])

const filters = [
  { value: '', labelKey: 'animals.filterAll' },
  { value: 'active', labelKey: 'animals.filterActive' },
  { value: 'dry', labelKey: 'animals.filterDry' },
  { value: 'pregnant', labelKey: 'animals.filterPregnant' },
  { value: 'sick', labelKey: 'animals.filterSick' },
  { value: 'sold', labelKey: 'animals.filterSold' },
  { value: 'dead', labelKey: 'animals.filterDead' },
]

// Life phase filter chips — built dynamically from species config
const lifePhaseFilters = computed(() => {
  const filters = [{ value: '', labelKey: 'animals.filterAllPhases' }]
  const phases = lifePhasesConfig.value
  if (phases) {
    // Collect unique phase codes from female + male arrays
    const seen = new Set()
    ;[...(phases.female ?? []), ...(phases.male ?? [])].forEach((p) => {
      if (!seen.has(p.code)) {
        seen.add(p.code)
        filters.push({ value: p.code, labelKey: `lifePhase.${p.code}` })
      }
    })
  } else {
    // Fallback: cattle phases
    filters.push(
      { value: 'calf', labelKey: 'lifePhase.calf' },
      { value: 'heifer', labelKey: 'lifePhase.heifer' },
      { value: 'cow', labelKey: 'lifePhase.cow' },
      { value: 'young_bull', labelKey: 'lifePhase.young_bull' },
      { value: 'bull', labelKey: 'lifePhase.bull' }
    )
  }
  return filters
})

// Client-side filter for "Ready to Breed" — uses last_calving_date from API response
const displayedAnimals = computed(() => {
  if (!readyToBreed.value) return animalsStore.animals
  return animalsStore.animals.filter((animal) => {
    const breed = breedTypesStore.activeTypes.find((b) => b.id === animal.breed_type_id) ?? null
    return computeIsReadyToBreed(animal, breed, animal.last_calving_date ?? null)
  })
})

const advancedFilterCount = computed(() => {
  let n = 0
  if (sexFilter.value) n++
  if (breedFilter.value) n++
  if (lifePhaseFilter.value) n++
  if (pregnantFilter.value) n++
  if (readyToBreed.value) n++
  if (featureFlagsStore.flags.milkRecording) {
    if (dimMin.value != null && dimMin.value !== '') n++
    if (dimMax.value != null && dimMax.value !== '') n++
    if (calvingAfter.value) n++
    if (calvingBefore.value) n++
    if (yieldMin.value != null && yieldMin.value !== '') n++
    if (yieldMax.value != null && yieldMax.value !== '') n++
  }
  return n
})

function loadAnimals() {
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
  animalsStore.fetchAll(params)
}

function onSearch() {
  page.value = 1
  loadAnimals()
}

function setFilter(value) {
  activeFilter.value = value
  page.value = 1
  loadAnimals()
}

function setSexFilter(value) {
  sexFilter.value = value
  page.value = 1
  loadAnimals()
}

function setLifePhaseFilter(value) {
  lifePhaseFilter.value = value
  page.value = 1
  loadAnimals()
}

function setPregnantFilter(value) {
  pregnantFilter.value = value
  page.value = 1
  loadAnimals()
}

function onAdvancedChange() {
  page.value = 1
  loadAnimals()
}

function onPageChange(p) {
  page.value = p
  loadAnimals()
}

function onLimitChange(l) {
  limit.value = l
  page.value = 1
  loadAnimals()
}

loadAnimals()
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

.animal-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

@media (min-width: 600px) {
  .animal-list {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
}
</style>
