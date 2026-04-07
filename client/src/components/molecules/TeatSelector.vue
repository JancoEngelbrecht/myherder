<template>
  <div class="teat-selector">
    <p class="teat-hint">{{ t('healthIssues.affectedTeats') }}</p>
    <div class="udder-grid">
      <button
        v-for="teat in teats"
        :key="teat.value"
        type="button"
        class="teat-btn"
        :class="{ selected: isSelected(teat.value), readonly }"
        :disabled="readonly"
        @click="toggle(teat.value)"
      >
        <span class="teat-label">{{ t(`healthIssues.teatLabels.${teat.value}`) }}</span>
        <span class="teat-abbr">{{ teat.abbr }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
  readonly: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const teats = [
  { value: 'front_left', abbr: 'FL' },
  { value: 'front_right', abbr: 'FR' },
  { value: 'rear_left', abbr: 'RL' },
  { value: 'rear_right', abbr: 'RR' },
]

function isSelected(value) {
  return (props.modelValue ?? []).includes(value)
}

function toggle(value) {
  if (props.readonly) return
  const current = props.modelValue ?? []
  if (current.includes(value)) {
    emit(
      'update:modelValue',
      current.filter((v) => v !== value)
    )
  } else {
    emit('update:modelValue', [...current, value])
  }
}
</script>

<style scoped>
.teat-selector {
  margin-top: 4px;
}

.udder-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  max-width: 220px;
}

.teat-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 12px 8px;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
  min-height: 64px;
}

.teat-btn:not(.readonly):hover {
  border-color: var(--danger);
  background: #fff5f5;
}

.teat-btn.selected {
  border-color: var(--danger);
  background: #fce4e4;
  color: var(--danger);
}

.teat-btn.readonly {
  cursor: default;
}

.teat-abbr {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 700;
}

.teat-label {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: currentColor;
}

.teat-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 6px;
}
</style>
