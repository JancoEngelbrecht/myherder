<template>
  <div class="breeding-event-card card" :class="{ compact }" @click="navigateToEvent">
    <div class="event-avatar" :class="`event-${eventCategory}`">
      <AppIcon :name="getEventType(event.event_type)?.icon ?? 'clipboard-list'" :size="22" />
    </div>

    <div class="event-info">
      <div class="event-top">
        <span class="event-date mono">{{ formatDate(event.event_date) }}</span>
        <span class="badge" :class="`badge-event-${eventCategory}`">
          {{ t(`breeding.eventTypes.${event.event_type}`, event.event_type) }}
        </span>
      </div>
      <div v-if="showCow" class="event-cow-name">
        {{ event.tag_number }}{{ event.cow_name ? ` · ${event.cow_name}` : '' }}
      </div>
      <div v-if="hasMetaText" class="event-meta">{{ metaText }}</div>

      <!-- Auto-calculated dates -->
      <div v-if="hasAutoDates" class="auto-dates">
        <span v-if="event.expected_next_heat" class="date-chip">
          <AppIcon name="flame" :size="11" />
          {{ t('breeding.dates.nextHeat') }}:
          <span class="mono">{{ formatDate(event.expected_next_heat) }}</span>
        </span>
        <span v-if="event.expected_preg_check" class="date-chip">
          <AppIcon name="stethoscope" :size="11" />
          {{ t('breeding.dates.pregCheck') }}:
          <span class="mono">{{ formatDate(event.expected_preg_check) }}</span>
        </span>
        <span v-if="event.expected_calving" class="date-chip">
          <AppIcon name="baby" :size="11" />
          {{ t('breeding.dates.calving') }}:
          <span class="mono">{{ formatDate(event.expected_calving) }}</span>
        </span>
      </div>

      <!-- Notes (truncated) -->
      <p v-if="event.notes" class="event-notes">{{ event.notes }}</p>

      <div v-if="showDelete" class="card-actions" @click.stop>
        <button class="btn-edit" @click="$emit('edit', event.id)">{{ t('common.edit') }}</button>
        <button class="btn-delete" @click="$emit('delete', event.id)">
          {{ t('common.delete') }}
        </button>
      </div>
    </div>

    <div v-if="showCow" class="event-chevron">›</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppIcon from '../atoms/AppIcon.vue'
import { getEventType } from '../../config/breedingEventTypes'

const { t } = useI18n()
const router = useRouter()

const props = defineProps({
  event: { type: Object, required: true },
  showCow: { type: Boolean, default: true },
  showDelete: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

defineEmits(['delete', 'edit'])

const eventCategory = computed(() => {
  const type = props.event.event_type
  if (type === 'heat_observed') return 'heat'
  if (type === 'ai_insemination' || type === 'bull_service') return 'insem'
  if (type === 'preg_check_positive') return 'preg-pos'
  if (type === 'preg_check_negative') return 'preg-neg'
  if (type === 'calving') return 'calving'
  if (type === 'dry_off') return 'dry-off'
  if (type === 'abortion') return 'abort'
  return 'default'
})

const hasInsemDetails = computed(
  () =>
    ['ai_insemination', 'bull_service'].includes(props.event.event_type) &&
    (props.event.sire_name || props.event.semen_id || props.event.inseminator)
)

const calvingDetails = computed(() => {
  if (props.event.event_type !== 'calving') return null
  const d = props.event.calving_details
  if (!d) return null
  if (typeof d !== 'string') return d
  try {
    return JSON.parse(d)
  } catch {
    return null
  }
})

const metaText = computed(() => {
  if (hasInsemDetails.value) {
    if (props.event.sire_name) return props.event.sire_name
    if (props.event.inseminator) return props.event.inseminator
  }
  if (props.event.preg_check_method) {
    return t(`breeding.pregCheckMethod.${props.event.preg_check_method}`)
  }
  if (calvingDetails.value) {
    const parts = []
    if (calvingDetails.value.calf_sex) {
      parts.push(t(`sex.${calvingDetails.value.calf_sex}`))
    }
    if (calvingDetails.value.calf_tag_number) parts.push(calvingDetails.value.calf_tag_number)
    if (parts.length) return parts.join(' · ')
  }
  return ''
})

const hasMetaText = computed(() => metaText.value.length > 0)

const hasAutoDates = computed(
  () =>
    props.event.expected_next_heat ||
    props.event.expected_preg_check ||
    props.event.expected_calving
)

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function navigateToEvent() {
  if (props.showCow && props.event.cow_id) {
    router.push(`/animals/${props.event.cow_id}`)
  }
}
</script>

<style scoped>
.breeding-event-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition:
    transform 0.1s,
    box-shadow 0.1s;
  overflow: hidden;
}

.breeding-event-card:active {
  transform: scale(0.985);
  box-shadow: none;
}

.event-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.event-heat {
  background: #fff0f0;
}
.event-insem {
  background: #eff0ff;
}
.event-preg-pos {
  background: #eefbf0;
}
.event-preg-neg {
  background: #fff0f0;
}
.event-calving {
  background: #fff8ec;
}
.event-dry-off {
  background: #f0fbf4;
}
.event-abort {
  background: #fff0f0;
}
.event-default {
  background: var(--bg);
}

.event-info {
  flex: 1;
  min-width: 0;
}

.event-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 1px;
}

.event-date {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--primary);
  white-space: nowrap;
}

.badge-event-heat {
  background: #fecaca;
  color: #991b1b;
}
.badge-event-insem {
  background: #dbeafe;
  color: #1e40af;
}
.badge-event-preg-pos {
  background: #d1fae5;
  color: #065f46;
}
.badge-event-preg-neg {
  background: #fecaca;
  color: #991b1b;
}
.badge-event-calving {
  background: #fef3c7;
  color: #92400e;
}
.badge-event-dry-off {
  background: #d1fae5;
  color: #065f46;
}
.badge-event-abort {
  background: #fecaca;
  color: #991b1b;
}
.badge-event-default {
  background: var(--bg);
  color: var(--text-secondary);
}

.event-cow-name {
  font-weight: 600;
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-meta {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.auto-dates {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.date-chip {
  font-size: 0.68rem;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
  color: var(--primary);
  border-radius: 6px;
  padding: 1px 5px;
  white-space: nowrap;
}

.event-notes {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin: 3px 0 0;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-chevron {
  font-size: 1.25rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 4px;
}

.btn-edit {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0.15rem 0;
  font-weight: 600;
}

.btn-delete {
  background: none;
  border: none;
  color: var(--danger);
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0.15rem 0;
  font-weight: 600;
}

@media (min-width: 600px) {
  .breeding-event-card:not(.compact) {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 14px 16px;
  }

  .breeding-event-card:not(.compact) .event-avatar {
    width: 48px;
    height: 48px;
  }

  .breeding-event-card:not(.compact) .event-chevron {
    display: none;
  }

  .breeding-event-card:not(.compact) .event-cow-name {
    white-space: normal;
  }

  .breeding-event-card:not(.compact) .event-meta {
    white-space: normal;
  }

  .breeding-event-card:not(.compact) .event-notes {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
</style>
