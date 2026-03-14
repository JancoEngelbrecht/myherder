<template>
  <Transition name="fade">
    <div v-if="show" class="dialog-overlay" @click.self="$emit('cancel')" @keydown.escape="$emit('cancel')">
      <div ref="dialogEl" class="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-msg">
        <p id="confirm-dialog-msg" class="dialog-text">{{ message }}</p>
        <div class="dialog-actions">
          <button class="btn-danger" :disabled="loading" @click="$emit('confirm')">
            {{ confirmLabel || t('common.confirm') }}
          </button>
          <button class="btn-secondary" :disabled="loading" @click="$emit('cancel')">
            {{ cancelLabel || t('common.cancel') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const dialogEl = ref(null)

const props = defineProps({
  show: { type: Boolean, default: false },
  message: { type: String, required: true },
  confirmLabel: { type: String, default: '' },
  cancelLabel: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})

defineEmits(['confirm', 'cancel'])

// Auto-focus the cancel button when dialog opens
watch(() => props.show, async (visible) => {
  if (visible) {
    await nextTick()
    dialogEl.value?.querySelector('.btn-secondary')?.focus()
  }
})
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  padding: 24px;
}

.dialog {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 320px;
  box-shadow: var(--shadow-lg);
}

.dialog-text {
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  margin-bottom: 20px;
}

.dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
