<template>
  <div class="page">
    <AppHeader :title="t('breeding.eventsTitle')" show-back back-to="/breed" />

    <div class="page-content">
      <!-- Filter tabs -->
      <div class="filter-chips">
        <button
          v-for="f in eventFilters"
          :key="f.value"
          class="chip"
          :class="{ active: eventFilter === f.value }"
          @click="setEventFilter(f.value)"
        >{{ f.label }}</button>
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
    <RouterLink to="/breed/log?from=/breed/events" class="fab">+</RouterLink>

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
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppHeader from '../components/organisms/AppHeader.vue'
import BreedingEventCard from '../components/molecules/BreedingEventCard.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'
import PaginationBar from '../components/atoms/PaginationBar.vue'
import { useBreedingEventsStore } from '../stores/breedingEvents'
import { useAuthStore } from '../stores/auth'

const { t } = useI18n()
const router = useRouter()
const breedingStore = useBreedingEventsStore()
const authStore = useAuthStore()

const deleteTargetId = ref(null)
const deleting = ref(false)
const page = ref(1)
const limit = ref(20)
const eventFilter = ref('')

const eventFilters = [
  { value: '', label: t('cows.filterAll') },
  { value: 'heat_observed', label: '🔥' },
  { value: 'ai_insemination,bull_service', label: '🧬' },
  { value: 'preg_check_positive,preg_check_negative', label: '🩺' },
  { value: 'calving', label: '🐮' },
  { value: 'dry_off', label: '🌿' },
]

function fetchEvents() {
  const params = { page: page.value, limit: limit.value }
  if (eventFilter.value) params.event_type = eventFilter.value
  breedingStore.fetchAll(params)
}

function setEventFilter(value) {
  eventFilter.value = value
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

.filter-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}

.filter-chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex-shrink: 0;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 0.8rem;
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

.events-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
</style>
