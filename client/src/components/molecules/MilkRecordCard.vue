<template>
  <div class="milk-record-card" :class="{ 'card-discarded': record.milk_discarded }">
    <div class="card-top">
      <div class="cow-info">
        <span class="mono tag-number">{{ record.tag_number }}</span>
        <span v-if="record.cow_name" class="cow-name">{{ record.cow_name }}</span>
      </div>
      <div class="litres-info">
        <span class="mono litres">{{ Number(record.litres).toFixed(1) }} L</span>
        <span v-if="record.milk_discarded" class="discarded-badge">{{ t('milkHistory.discardedLabel') }}</span>
      </div>
    </div>
    <div class="card-bottom">
      <span class="detail">{{ sessionLabel }} &bull; {{ formattedDate }}</span>
      <span v-if="record.session_time" class="detail"> &bull; {{ record.session_time }}</span>
    </div>
    <div v-if="record.recorded_by_name" class="card-meta">
      {{ t('milkHistory.recordedBy', { name: record.recorded_by_name }) }}
    </div>
    <div v-if="record.milk_discarded && record.discard_reason" class="discard-reason">
      {{ record.discard_reason }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  record: { type: Object, required: true },
})

const sessionLabel = computed(() => {
  const key = `milkHistory.${props.record.session}`
  return t(key)
})

const formattedDate = computed(() => {
  const raw = props.record.recording_date
  if (!raw) return ''
  // Extract YYYY-MM-DD from ISO string or plain date
  const dateStr = raw.slice(0, 10)
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
})
</script>

<style scoped>
.milk-record-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  box-shadow: var(--shadow-card);
}

.card-discarded {
  border-color: var(--danger);
  border-width: 2px;
  background: var(--danger-light);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.cow-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex: 1;
}

.tag-number {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
}

.cow-name {
  font-size: 0.9rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.litres-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.litres {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
}

.discarded-badge {
  font-size: 0.72rem;
  color: var(--danger);
  background: var(--danger-light);
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-radius: 6px;
  padding: 0.1rem 0.4rem;
  font-weight: 600;
  white-space: nowrap;
}

.card-bottom {
  margin-top: 0.35rem;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.detail {
  white-space: nowrap;
}

.card-meta {
  margin-top: 0.2rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.discard-reason {
  margin-top: 0.25rem;
  font-size: 0.78rem;
  color: var(--danger);
  font-style: italic;
}
</style>
