<template>
  <div class="milk-entry-card" :class="cardClass">
    <!-- Withdrawal banner -->
    <div v-if="onWithdrawal" class="withdrawal-banner">
      <span class="withdrawal-icon">⚠</span>
      <span>{{ t('milkRecording.withdrawalBanner', { date: formattedWithdrawalDate }) }}</span>
    </div>

    <div class="card-body">
      <!-- Cow info -->
      <div class="cow-info">
        <span class="mono tag-number">{{ cow.tag_number }}</span>
        <span v-if="cow.name" class="cow-name">{{ cow.name }}</span>
      </div>

      <!-- Litres input + sync badge -->
      <div class="input-row">
        <div class="input-wrapper">
          <input
            ref="inputRef"
            type="number"
            class="form-input litres-input"
            :class="{ 'input-withdrawal': onWithdrawal }"
            min="0"
            max="999.99"
            step="0.5"
            placeholder="0.0"
            @input="handleInput"
            @focus="onFocus"
            @blur="onBlur"
          />
          <span class="unit-label">L</span>
        </div>

        <span class="sync-badge" :class="statusClass">{{ statusLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  cow: { type: Object, required: true },
  record: { type: Object, default: null },
  syncStatus: { type: String, default: 'idle' },
  onWithdrawal: { type: Boolean, default: false },
  withdrawalUntil: { type: String, default: null },
})

const emit = defineEmits(['update'])

const inputRef = ref(null)
const focused = ref(false)

// Sync the DOM input value from the record prop, but ONLY when the user
// is not actively editing. This prevents Vue's DOM patching from resetting
// the browser's number-input state and eating keystrokes.
watch(() => props.record?.litres, (val) => {
  if (focused.value || !inputRef.value) return
  inputRef.value.value = val != null ? val : ''
}, { immediate: false })

function onFocus() {
  focused.value = true
}

function onBlur() {
  focused.value = false
  // Sync from record on blur in case the API responded with a slightly different value
  if (inputRef.value) {
    const litres = props.record?.litres
    inputRef.value.value = litres != null ? litres : ''
  }
}

// Populate initial value when the component mounts with an existing record
onMounted(() => {
  if (inputRef.value && props.record) {
    inputRef.value.value = props.record.litres
  }
})

const cardClass = computed(() => ({
  'card-withdrawal': props.onWithdrawal,
}))

const formattedWithdrawalDate = computed(() => {
  if (!props.withdrawalUntil) return ''
  return new Date(props.withdrawalUntil).toLocaleDateString()
})

const statusLabel = computed(() => {
  switch (props.syncStatus) {
    case 'saving': return t('milkRecording.saving')
    case 'saved': return t('milkRecording.saved')
    case 'error': return t('milkRecording.syncError')
    default: return ''
  }
})

const statusClass = computed(() => ({
  'status-saving': props.syncStatus === 'saving',
  'status-saved': props.syncStatus === 'saved',
  'status-error': props.syncStatus === 'error',
}))

function handleInput(event) {
  const val = event.target.value
  // Treat empty field as 0 — worker cleared the input intentionally
  const num = val === '' ? 0 : parseFloat(val)
  if (!isNaN(num) && num >= 0) {
    emit('update', num)
  }
}
</script>

<style scoped>
.milk-entry-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s;
  box-shadow: var(--shadow-card);
}

.card-withdrawal {
  border-color: var(--danger);
  border-width: 2px;
}

.withdrawal-banner {
  background: var(--danger);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.4rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  animation: pulse-bg 1.5s ease-in-out infinite;
}

@keyframes pulse-bg {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.withdrawal-icon {
  font-size: 1rem;
}

.card-body {
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.cow-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
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

.input-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.litres-input {
  width: 80px;
  text-align: right;
  padding-right: 1.6rem;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  margin: 0;
}

.input-withdrawal {
  border-color: var(--danger);
  background: var(--danger-light);
}

.unit-label {
  position: absolute;
  right: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  pointer-events: none;
}

.sync-badge {
  font-size: 0.75rem;
  min-width: 70px;
  text-align: right;
  white-space: nowrap;
  color: var(--text-muted);
}

.status-saving {
  color: var(--warning);
}

.status-saved {
  color: var(--primary);
  font-weight: 600;
}

.status-error {
  color: var(--danger);
  font-weight: 600;
}
</style>
