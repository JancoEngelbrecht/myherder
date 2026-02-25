<template>
  <div class="breeding-event-card card">
    <div class="card-header">
      <span class="event-icon">{{ getEventType(event.event_type)?.emoji ?? '📋' }}</span>
      <div class="event-meta">
        <span class="event-type">{{ t(`breeding.eventTypes.${event.event_type}`, event.event_type) }}</span>
        <span class="event-date mono">{{ formatDate(event.event_date) }}</span>
      </div>
      <RouterLink
        v-if="showCow"
        :to="`/cows/${event.cow_id}`"
        class="cow-chip mono"
      >
        {{ event.tag_number }}{{ event.cow_name ? ` · ${event.cow_name}` : '' }}
      </RouterLink>
    </div>

    <!-- AI / Bull details -->
    <div v-if="hasInsemDetails" class="detail-row">
      <span v-if="event.sire_name" class="detail-item">
        <span class="detail-label">🐂</span> {{ event.sire_name }}
      </span>
      <span v-if="event.semen_id" class="detail-item mono">
        {{ event.semen_id }}
      </span>
      <span v-if="event.inseminator" class="detail-item">
        {{ event.inseminator }}
      </span>
    </div>

    <!-- Preg check method -->
    <div v-if="event.preg_check_method" class="detail-row">
      <span class="detail-item">{{ t(`breeding.pregCheckMethod.${event.preg_check_method}`) }}</span>
    </div>

    <!-- Calving details -->
    <div v-if="calvingDetails" class="detail-row">
      <span v-if="calvingDetails.calf_sex" class="detail-item">
        {{ calvingDetails.calf_sex === 'male' ? '🐂' : '🐄' }} {{ t(`sex.${calvingDetails.calf_sex}`) }}
      </span>
      <span v-if="calvingDetails.calf_tag_number" class="detail-item mono">
        {{ calvingDetails.calf_tag_number }}
      </span>
      <span v-if="calvingDetails.calf_weight" class="detail-item">
        {{ calvingDetails.calf_weight }} kg
      </span>
    </div>

    <!-- Auto-calculated dates -->
    <div v-if="hasAutoDates" class="auto-dates">
      <span v-if="event.expected_next_heat" class="date-chip">
        🔥 {{ t('breeding.dates.nextHeat') }}: <span class="mono">{{ event.expected_next_heat }}</span>
      </span>
      <span v-if="event.expected_preg_check" class="date-chip">
        🩺 {{ t('breeding.dates.pregCheck') }}: <span class="mono">{{ event.expected_preg_check }}</span>
      </span>
      <span v-if="event.expected_calving" class="date-chip">
        🐮 {{ t('breeding.dates.calving') }}: <span class="mono">{{ event.expected_calving }}</span>
      </span>
    </div>

    <!-- Notes -->
    <p v-if="event.notes" class="event-notes">{{ event.notes }}</p>

    <div v-if="showDelete" class="card-actions">
      <button class="btn-edit" @click="$emit('edit', event.id)">{{ t('common.edit') }}</button>
      <button class="btn-delete" @click="$emit('delete', event.id)">{{ t('common.delete') }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getEventType } from '../../config/breedingEventTypes'

const { t } = useI18n()

const props = defineProps({
  event: { type: Object, required: true },
  showCow: { type: Boolean, default: true },
  showDelete: { type: Boolean, default: false },
})

defineEmits(['delete', 'edit'])

const hasInsemDetails = computed(() =>
  ['ai_insemination', 'bull_service'].includes(props.event.event_type) &&
  (props.event.sire_name || props.event.semen_id || props.event.inseminator),
)

const calvingDetails = computed(() => {
  if (props.event.event_type !== 'calving') return null
  const d = props.event.calving_details
  if (!d) return null
  return typeof d === 'string' ? JSON.parse(d) : d
})

const hasAutoDates = computed(() =>
  props.event.expected_next_heat || props.event.expected_preg_check || props.event.expected_calving,
)

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<style scoped>
.breeding-event-card {
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.event-icon {
  font-size: 1.3rem;
  flex-shrink: 0;
}

.event-meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.event-type {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text);
}

.event-date {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.cow-chip {
  font-size: 0.78rem;
  font-weight: 600;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 0.2rem 0.65rem;
  color: var(--primary);
  text-decoration: none;
  white-space: nowrap;
}

.detail-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.detail-item {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.detail-label {
  margin-right: 0.2rem;
}

.auto-dates {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.date-chip {
  font-size: 0.75rem;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
  color: var(--primary);
  border-radius: 6px;
  padding: 0.2rem 0.5rem;
}

.event-notes {
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin: 0;
  font-style: italic;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.25rem;
}

.btn-edit {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.2rem 0;
  font-weight: 600;
}

.btn-delete {
  background: none;
  border: none;
  color: var(--danger);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.2rem 0;
  font-weight: 600;
}
</style>
