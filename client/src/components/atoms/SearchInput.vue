<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Search...' },
  clearLabel: { type: String, default: 'Clear' },
})

const emit = defineEmits(['update:modelValue'])

const internal = ref(props.modelValue)
let debounceTimer = null

watch(
  () => props.modelValue,
  (val) => {
    if (val !== internal.value) internal.value = val
  }
)

function onInput(e) {
  internal.value = e.target.value
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    emit('update:modelValue', internal.value)
  }, 300)
}

function clear() {
  internal.value = ''
  clearTimeout(debounceTimer)
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="search-input-wrap">
    <span class="search-icon" aria-hidden="true">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </span>
    <input
      class="search-input form-input"
      type="search"
      :value="internal"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
    />
    <button
      v-if="internal"
      class="search-clear"
      type="button"
      :aria-label="clearLabel"
      @click="clear"
    >
      ✕
    </button>
  </div>
</template>

<style scoped>
.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-muted);
  display: flex;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding-left: 38px;
  padding-right: 36px;
}

/* Remove browser default search cancel button */
.search-input::-webkit-search-cancel-button {
  display: none;
}

.search-clear {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  line-height: 1;
  transition: color 0.15s;
}

.search-clear:hover {
  color: var(--text-secondary);
}
</style>
