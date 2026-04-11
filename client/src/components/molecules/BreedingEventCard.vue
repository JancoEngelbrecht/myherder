<template>
  <div class="breeding-event-card card" :class="{ compact }" @click="navigateToEvent">
    <!-- Header row: avatar + title/subtitle + badge -->
    <div class="card-header">
      <div class="event-avatar" :class="`event-${eventCategory}`">
        <AppIcon :name="getEventType(event.event_type)?.icon ?? 'clipboard-list'" :size="20" />
      </div>

      <div class="header-text">
        <div v-if="showCow" class="event-title">
          {{ event.tag_number
          }}<span v-if="event.animal_name" class="cow-name-sub"> · {{ event.animal_name }}</span>
        </div>
        <div class="event-subtitle">
          <span class="event-date mono">{{ formatDate(event.event_date) }}</span>
          <template v-if="hasMetaText">
            <span class="subtitle-sep">·</span>
            <span class="event-meta">{{ metaText }}</span>
          </template>
        </div>
      </div>

      <span class="badge" :class="`badge-event-${eventCategory}`">
        {{ t(`breeding.eventTypes.${event.event_type}`, event.event_type) }}
      </span>
    </div>

    <!-- Body: auto-dates + notes -->
    <div v-if="hasAutoDates || event.notes" class="card-body">
      <div v-if="hasAutoDates" class="auto-dates">
        <span v-if="event.expected_next_heat" class="date-chip">
          <AppIcon name="flame" :size="12" />
          <span>{{ t('breeding.dates.nextHeat') }}</span>
          <span class="mono">{{ formatDate(event.expected_next_heat) }}</span>
        </span>
        <span v-if="event.expected_preg_check" class="date-chip">
          <AppIcon name="stethoscope" :size="12" />
          <span>{{ t('breeding.dates.pregCheck') }}</span>
          <span class="mono">{{ formatDate(event.expected_preg_check) }}</span>
        </span>
        <span v-if="event.expected_calving" class="date-chip">
          <AppIcon name="baby" :size="12" />
          <span>{{ t('breeding.dates.calving') }}</span>
          <span class="mono">{{ formatDate(event.expected_calving) }}</span>
        </span>
      </div>

      <p v-if="event.notes" class="event-notes">{{ event.notes }}</p>
    </div>

    <!-- Footer: actions -->
    <div v-if="showDelete" class="card-footer" @click.stop>
      <button class="btn-edit" @click="$emit('edit', event.id)">{{ t('common.edit') }}</button>
      <button class="btn-delete" @click="$emit('delete', event.id)">
        {{ t('common.delete') }}
      </button>
    </div>
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
  if (props.showCow && props.event.animal_id) {
    router.push(`/animals/${props.event.animal_id}`)
  }
}
</script>

<style scoped>
.breeding-event-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition:
    transform 0.1s,
    box-shadow 0.1s;
  overflow: hidden;
}

.breeding-event-card:active {
  transform: scale(0.99);
  box-shadow: none;
}

/* ── Header ─────────────────────────────────── */
.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.event-avatar {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.event-heat,
.event-preg-neg,
.event-abort {
  background: #fff0f0;
}
.event-insem {
  background: #eff0ff;
}
.event-preg-pos,
.event-dry-off {
  background: #eefbf0;
}
.event-calving {
  background: #fff8ec;
}
.event-default {
  background: var(--bg);
}

.header-text {
  flex: 1;
  min-width: 0;
}

.event-title {
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-primary);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cow-name-sub {
  font-weight: 500;
  color: var(--text-secondary);
}

.event-subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  min-width: 0;
}

.event-date {
  font-weight: 600;
  color: var(--primary);
  white-space: nowrap;
}

.subtitle-sep {
  color: var(--text-muted);
}

.event-meta {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.badge-event-heat,
.badge-event-preg-neg,
.badge-event-abort {
  background: #fecaca;
  color: #991b1b;
}
.badge-event-insem {
  background: #dbeafe;
  color: #1e40af;
}
.badge-event-preg-pos,
.badge-event-dry-off {
  background: #d1fae5;
  color: #065f46;
}
.badge-event-calving {
  background: #fef3c7;
  color: #92400e;
}
.badge-event-default {
  background: var(--bg);
  color: var(--text-secondary);
}

/* ── Body ───────────────────────────────────── */
.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 54px; /* align with header-text (avatar 42 + gap 12) */
}

.auto-dates {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.date-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  color: var(--primary);
  border-radius: 6px;
  padding: 3px 8px;
  white-space: nowrap;
  font-weight: 500;
}

.event-notes {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Footer ─────────────────────────────────── */
.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.btn-edit,
.btn-delete {
  background: none;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 6px;
  transition: background 0.1s;
}

.btn-edit {
  color: var(--primary);
}
.btn-edit:hover {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.btn-delete {
  color: var(--danger);
}
.btn-delete:hover {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}

/* ── Compact mode (per-cow lists) ───────────── */
.breeding-event-card.compact {
  padding: 10px 12px;
  gap: 6px;
}

.breeding-event-card.compact .event-avatar {
  width: 36px;
  height: 36px;
}

.breeding-event-card.compact .card-body {
  padding-left: 48px;
}
</style>
