<template>
  <div class="page">
    <AppHeader :title="t('breeding.eventsTitle')" show-back back-to="/breed" />

    <div class="page-content">
      <!-- Event type filter chips -->
      <div class="filter-chips">
        <button
          v-for="f in eventFilters"
          :key="f.value"
          class="chip"
          :class="{ active: eventFilter === f.value }"
          @click="setEventFilter(f.value)"
        >{{ f.label }}</button>
      </div>

      <!-- Advanced filters toggle -->
      <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">
        {{ t('breeding.advancedFilters') }}
        <span v-if="advancedFilterCount > 0" class="filter-badge">{{ advancedFilterCount }}</span>
        <span class="toggle-arrow" :class="{ open: showAdvanced }">&#9662;</span>
      </button>

      <div v-if="showAdvanced" class="advanced-filters">
        <!-- Cow group -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('breeding.filterGroupCow') }}</span>
          <CowSearchDropdown v-model="cowFilter" :placeholder="t('breeding.form.cowPlaceholder')" />
          <div class="filter-chips filter-chips-wrap">
            <button class="chip" :class="{ active: cowStatusFilter === '' }" :aria-pressed="cowStatusFilter === ''" @click="setCowStatusFilter('')">{{ t('cows.filterAll') }}</button>
            <button class="chip" :class="{ active: cowStatusFilter === 'active' }" :aria-pressed="cowStatusFilter === 'active'" @click="setCowStatusFilter('active')">{{ t('status.active') }}</button>
            <button class="chip" :class="{ active: cowStatusFilter === 'pregnant' }" :aria-pressed="cowStatusFilter === 'pregnant'" @click="setCowStatusFilter('pregnant')">{{ t('status.pregnant') }}</button>
            <button class="chip" :class="{ active: cowStatusFilter === 'dry' }" :aria-pressed="cowStatusFilter === 'dry'" @click="setCowStatusFilter('dry')">{{ t('breeding.filterDry') }}</button>
          </div>
        </div>

        <div class="filter-divider" />

        <!-- Date group -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('breeding.filterGroupDate') }}</span>
          <div class="filter-range-row">
            <span class="filter-label">{{ t('breeding.filterEventDate') }}</span>
            <div class="filter-range-inputs">
              <input v-model="dateFrom" type="date" class="form-input filter-date-input" @change="onAdvancedChange" />
              <span class="filter-sep">–</span>
              <input v-model="dateTo" type="date" class="form-input filter-date-input" @change="onAdvancedChange" />
            </div>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="breedingStore.loading" class="empty-state">
        <span class="spinner" />
        <p>{{ t('common.loading') }}</p>
      </div>

      <!-- Events list -->
      <div v-else-if="breedingStore.events.length" class="events-list">
        <BreedingEventCard
          v-for="ev in breedingStore.events"
          :key="ev.id"
          :event="ev"
          :show-cow="true"
          :show-delete="authStore.isAdmin"
          :compact="true"
          @edit="goToEdit"
          @delete="confirmDelete"
        />
      </div>

      <!-- Empty state -->
      <div v-else class="empty-state">
        <p>{{ t('breeding.noEvents') }}</p>
      </div>

      <!-- Pagination -->
      <PaginationBar
        :total="breedingStore.total"
        :page="page"
        :limit="limit"
        :page-size-options="[20, 50, 100]"
        @update:page="onPageChange"
        @update:limit="onLimitChange"
      />
    </div>

    <!-- FAB -->
    <RouterLink to="/breed/log?from=/breed/events" class="fab" :title="t('breeding.logEvent')">+</RouterLink>

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

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppHeader from '../components/organisms/AppHeader.vue'
import BreedingEventCard from '../components/molecules/BreedingEventCard.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'
import CowSearchDropdown from '../components/molecules/CowSearchDropdown.vue'
import PaginationBar from '../components/atoms/PaginationBar.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../composables/useToast'
import { extractApiError, resolveError } from '../utils/apiError'

const { t } = useI18n()
const router = useRouter()
const breedingStore = useBreedingEventsStore()
const toast = useToast()
const authStore = useAuthStore()

// Pagination
const page = ref(1)
const limit = ref(20)

// Event type filter (top-level chips)
const eventFilter = ref('')

// Advanced filters
const showAdvanced = ref(false)
const cowFilter = ref(null)
const cowStatusFilter = ref('')
const dateFrom = ref('')
const dateTo = ref('')

// Delete state
const deleteTargetId = ref(null)
const deleting = ref(false)

const eventFilters = [
  { value: '', label: t('cows.filterAll') },
  { value: 'heat_observed', label: '🔥' },
  { value: 'ai_insemination,bull_service', label: '🧬' },
  { value: 'preg_check_positive,preg_check_negative', label: '🩺' },
  { value: 'calving', label: '🐮' },
  { value: 'dry_off', label: '🌿' },
]

const advancedFilterCount = computed(() => {
  let count = 0
  if (cowFilter.value) count++
  if (cowStatusFilter.value) count++
  if (dateFrom.value) count++
  if (dateTo.value) count++
  return count
})

watch(cowFilter, () => onAdvancedChange())

function fetchEvents() {
  const params = { page: page.value, limit: limit.value }
  if (eventFilter.value) params.event_type = eventFilter.value
  if (cowFilter.value) params.cow_id = cowFilter.value
  if (cowStatusFilter.value) params.cow_status = cowStatusFilter.value
  if (dateFrom.value) params.date_from = dateFrom.value
  if (dateTo.value) params.date_to = dateTo.value
  breedingStore.fetchAll(params)
}

function setEventFilter(value) {
  eventFilter.value = value
  page.value = 1
  fetchEvents()
}

function setCowStatusFilter(value) {
  cowStatusFilter.value = value
  page.value = 1
  fetchEvents()
}

function onAdvancedChange() {
  page.value = 1
  fetchEvents()
}

function onPageChange(p) {
  page.value = p
  fetchEvents()
}

function onLimitChange(l) {
  limit.value = l
  page.value = 1
  fetchEvents()
}

function goToEdit(id) {
  router.push(`/breed/edit/${id}?from=/breed/events`)
}

function confirmDelete(id) {
  deleteTargetId.value = id
}

async function doDelete() {
  deleting.value = true
  try {
    await breedingStore.deleteEvent(deleteTargetId.value)
    fetchEvents()
  } catch (err) {
    toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    deleting.value = false
    deleteTargetId.value = null
  }
}

onMounted(() => {
  fetchEvents()
})
</script>

<style scoped>
.page-content {
  padding: calc(var(--header-height) + 1rem) 1rem 5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Advanced Filters ─── */

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
  padding: 0;
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

.filter-date-input {
  flex: 1;
  min-width: 0;
}

/* ── Events List ─── */

.events-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

@media (min-width: 600px) {
  .events-list {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  }
}
</style>
