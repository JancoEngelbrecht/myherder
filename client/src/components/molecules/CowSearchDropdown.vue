<template>
  <div ref="containerRef" class="search-dropdown">
    <input
      v-model="query"
      type="text"
      class="form-input"
      :class="{ error: !!error }"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />

    <Transition name="fade">
      <div v-if="showDropdown && results.length > 0" class="dropdown-list">
        <button
          v-for="cow in results"
          :key="cow.id"
          type="button"
          class="dropdown-item"
          @mousedown.prevent="select(cow)"
        >
          <span class="item-icon">{{
            cow.sex === 'male' ? speciesEmoji.male : speciesEmoji.female
          }}</span>
          <span class="item-tag mono">{{ cow.tag_number }}</span>
          <span class="item-name">{{ cow.name || '—' }}</span>
        </button>
      </div>
    </Transition>

    <Transition name="fade">
      <div
        v-if="showDropdown && query.length >= 2 && results.length === 0 && !searching"
        class="dropdown-empty"
      >
        {{ t('cows.noResults') }}
      </div>
    </Transition>

    <div v-if="selectedCow" class="selected-cow">
      <span>{{ selectedCow.sex === 'male' ? speciesEmoji.male : speciesEmoji.female }}</span>
      <span class="mono">{{ selectedCow.tag_number }}</span>
      <span>{{ selectedCow.name }}</span>
      <button type="button" class="clear-btn" @click="clear">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSpeciesTerms } from '../../composables/useSpeciesTerms.js'
import api from '../../services/api.js'
import db from '../../db/indexedDB.js'
import { isOfflineError } from '../../services/syncManager.js'

const { emoji: speciesEmoji } = useSpeciesTerms()

const props = defineProps({
  modelValue: { type: [String, null], default: null }, // cow id
  placeholder: { type: String, default: 'Search...' },
  sexFilter: { type: String, default: null }, // 'male' | 'female'
  error: { type: String, default: null },
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const query = ref('')
const results = ref([])
const selectedCow = ref(null)
const showDropdown = ref(false)
const searching = ref(false)
const containerRef = ref(null)
let debounceTimer = null
let searchGeneration = 0
let loadGeneration = 0

// If initial value set, load the cow (with IndexedDB fallback)
watch(
  () => props.modelValue,
  async (id) => {
    if (id && !selectedCow.value) {
      const gen = ++loadGeneration
      try {
        const r = await api.get(`/cows/${id}`)
        if (gen !== loadGeneration) return
        selectedCow.value = r.data
        query.value = ''
      } catch (err) {
        if (gen !== loadGeneration) return
        if (isOfflineError(err)) {
          try {
            const local = await db.cows.get(id)
            if (gen !== loadGeneration) return
            if (local && !local.deleted_at) {
              selectedCow.value = local
              query.value = ''
            }
          } catch {
            /* IndexedDB not ready */
          }
        }
      }
    }
  },
  { immediate: true }
)

function onInput() {
  selectedCow.value = null
  emit('update:modelValue', null)

  clearTimeout(debounceTimer)
  if (query.value.length < 2) {
    results.value = []
    showDropdown.value = false
    return
  }
  debounceTimer = setTimeout(search, 300)
}

function onFocus() {
  if (query.value.length >= 2 && results.value.length > 0) {
    showDropdown.value = true
  }
}

let blurTimer = null

function onBlur() {
  blurTimer = setTimeout(() => {
    showDropdown.value = false
  }, 200)
}

async function search() {
  const gen = ++searchGeneration
  searching.value = true
  showDropdown.value = true
  try {
    const params = { search: query.value }
    if (props.sexFilter) params.sex = props.sexFilter
    const r = await api.get('/cows', { params })
    if (gen !== searchGeneration) return
    results.value = r.data.slice(0, 8)
  } catch (err) {
    if (gen !== searchGeneration) return
    if (isOfflineError(err)) {
      const offline = await searchIndexedDB(query.value, props.sexFilter)
      if (gen !== searchGeneration) return
      results.value = offline
    } else {
      results.value = []
    }
  } finally {
    if (gen === searchGeneration) searching.value = false
  }
}

async function searchIndexedDB(term, sexFilter) {
  try {
    const lowerTerm = term.toLowerCase()
    let all = await db.cows.toArray()
    if (sexFilter) {
      all = all.filter((c) => c.sex === sexFilter)
    }
    return all
      .filter(
        (c) =>
          !c.deleted_at &&
          ((c.tag_number && c.tag_number.toLowerCase().includes(lowerTerm)) ||
            (c.name && c.name.toLowerCase().includes(lowerTerm)))
      )
      .slice(0, 8)
  } catch {
    return []
  }
}

function select(cow) {
  selectedCow.value = cow
  query.value = ''
  showDropdown.value = false
  emit('update:modelValue', cow.id)
}

function clear() {
  selectedCow.value = null
  query.value = ''
  emit('update:modelValue', null)
}

onUnmounted(() => {
  clearTimeout(debounceTimer)
  clearTimeout(blurTimer)
})
</script>

<style scoped>
.search-dropdown {
  position: relative;
}

.dropdown-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1.5px solid var(--primary);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  z-index: 300;
  max-height: 220px;
  overflow-y: auto;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  text-align: left;
  cursor: pointer;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border);
  font-family: var(--font-body);
  font-size: 0.9375rem;
  color: var(--text);
  transition: background 0.1s;
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background: var(--primary-bg);
}

.dropdown-empty {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  padding: 12px 14px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.875rem;
  color: var(--text-muted);
  z-index: 300;
}

.item-icon {
  font-size: 1rem;
}

.item-tag {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--primary);
}

.item-name {
  flex: 1;
  font-size: 0.9rem;
}

.selected-cow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 8px 12px;
  background: var(--primary-bg);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--primary-dark);
}

.selected-cow .mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.clear-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.clear-btn:hover {
  background: var(--surface-2);
}
</style>
