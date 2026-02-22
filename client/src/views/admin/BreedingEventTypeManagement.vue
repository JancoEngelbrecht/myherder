<template>
  <div class="page">
    <AppHeader :title="t('breedingEventTypes.title')" show-back back-to="/settings" />

    <div class="page-content bet-content">
      <!-- Edit form -->
      <div v-if="editing" class="card form-card">
        <h3 class="form-title">{{ t('breedingEventTypes.editTitle') }}</h3>
        <form @submit.prevent="save">
          <div class="form-row-2">
            <div class="form-group">
              <label>{{ t('breedingEventTypes.emoji') }}</label>
              <div class="emoji-picker-wrap">
                <button
                  type="button"
                  class="emoji-trigger"
                  :class="{ open: emojiPickerOpen }"
                  @click="emojiPickerOpen = !emojiPickerOpen"
                >
                  <span v-if="form.emoji" class="emoji-trigger-selected">{{ form.emoji }}</span>
                </button>
                <div v-if="emojiPickerOpen" class="emoji-grid">
                  <button
                    v-for="e in BREEDING_EMOJIS"
                    :key="e"
                    type="button"
                    class="emoji-option"
                    :class="{ selected: form.emoji === e }"
                    @click="selectEmoji(e)"
                  >{{ e }}</button>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label for="bet-name">{{ t('breedingEventTypes.name') }} *</label>
              <input
                id="bet-name"
                v-model="form.name"
                class="form-input"
                required
                maxlength="100"
                :placeholder="t('breedingEventTypes.namePlaceholder')"
              />
            </div>
          </div>

          <div class="form-group">
            <label class="info-label">{{ t('breedingEventTypes.code') }}</label>
            <span class="code-badge mono">{{ editing.code }}</span>
          </div>

          <div class="form-group">
            <label for="bet-order">{{ t('breedingEventTypes.sortOrder') }}</label>
            <input
              id="bet-order"
              v-model.number="form.sort_order"
              type="number"
              min="0"
              class="form-input sort-input"
            />
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="form.is_active" type="checkbox" />
              {{ t('common.active') }}
            </label>
          </div>

          <p v-if="formError" class="form-error">{{ formError }}</p>

          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="cancelForm">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? t('common.saving') : t('common.save') }}
            </button>
          </div>
        </form>
      </div>

      <!-- Loading -->
      <div v-else-if="store.loading" class="spinner-wrap"><div class="spinner" /></div>

      <!-- Type list -->
      <div v-else class="bet-list">
        <div
          v-for="et in store.types"
          :key="et.code"
          class="card bet-card"
          :class="{ inactive: !et.is_active }"
        >
          <div class="bet-header">
            <span class="bet-emoji">{{ et.emoji }}</span>
            <div class="bet-info">
              <span class="bet-name">{{ et.name }}</span>
              <span class="bet-code mono">{{ et.code }}</span>
            </div>
            <span class="badge" :class="et.is_active ? 'badge-active' : 'badge-inactive'">
              {{ et.is_active ? t('common.active') : t('common.inactive') }}
            </span>
          </div>
          <div class="bet-actions">
            <button class="btn-secondary btn-sm" @click="openEdit(et)">{{ t('common.edit') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import { useBreedingEventTypesStore } from '../../stores/breedingEventTypes'

const { t } = useI18n()
const store = useBreedingEventTypesStore()

const BREEDING_EMOJIS = [
  '🔥', '🧬', '🐂', '✅', '❌', '🐮', '⚠️',
  '🐄', '🐃', '🌡️', '💉', '🩺', '📋', '🏥',
  '🌿', '🍼', '⭐', '❓',
]

const editing = ref(null)
const saving = ref(false)
const formError = ref('')
const emojiPickerOpen = ref(false)

const form = ref({ name: '', emoji: '', is_active: true, sort_order: 0 })

onMounted(() => {
  if (store.types.length === 0) store.fetchAll()
})

function openEdit(et) {
  editing.value = et
  form.value = {
    name: et.name,
    emoji: et.emoji,
    is_active: et.is_active,
    sort_order: et.sort_order,
  }
  formError.value = ''
  emojiPickerOpen.value = false
}

function cancelForm() {
  editing.value = null
  emojiPickerOpen.value = false
}

function selectEmoji(e) {
  form.value.emoji = e
  emojiPickerOpen.value = false
}

async function save() {
  saving.value = true
  formError.value = ''
  try {
    await store.update(editing.value.code, {
      name: form.value.name,
      emoji: form.value.emoji,
      is_active: form.value.is_active,
      sort_order: form.value.sort_order,
    })
    editing.value = null
  } catch (err) {
    formError.value = err.response?.data?.error || err.message
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.bet-content {
  padding-bottom: 100px;
}

.form-card {
  margin: 0 auto 20px;
  padding: 20px;
  max-width: 600px;
}

.form-title {
  margin: 0 0 16px;
  font-size: 1rem;
  font-weight: 600;
}

.form-row-2 {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: start;
}

.emoji-picker-wrap {
  position: relative;
}

.emoji-trigger {
  width: 56px;
  height: 56px;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  transition: border-color 0.15s;
}

.emoji-trigger.open {
  border-color: var(--primary);
}

.emoji-grid {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  min-width: 200px;
}

.emoji-option {
  width: 32px;
  height: 32px;
  border: 2px solid transparent;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s;
}

.emoji-option:hover {
  background: var(--bg);
}

.emoji-option.selected {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.form-group {
  margin-bottom: 12px;
}

.info-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.code-badge {
  display: inline-block;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-top: 4px;
}

.sort-input {
  max-width: 120px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  cursor: pointer;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 16px;
}

.form-actions .btn-primary,
.form-actions .btn-secondary {
  width: auto;
  padding: 10px 20px;
}

.form-error {
  color: var(--danger);
  font-size: 0.85rem;
  margin-top: 8px;
}

.spinner-wrap {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.bet-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bet-card {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bet-card.inactive {
  opacity: 0.55;
}

.bet-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bet-emoji {
  font-size: 1.6rem;
  flex-shrink: 0;
  line-height: 1;
}

.bet-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bet-name {
  font-weight: 600;
  font-size: 0.95rem;
}

.bet-code {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.badge-active {
  background: var(--success-light);
  color: var(--primary-dark);
}

.badge-inactive {
  background: var(--border);
  color: var(--text-secondary);
}

.bet-actions {
  display: flex;
  gap: 8px;
}

.btn-sm {
  font-size: 0.8rem;
  padding: 6px 14px;
  width: auto;
}
</style>
