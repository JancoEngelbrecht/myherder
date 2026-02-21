<template>
  <Transition name="fade">
    <div v-if="show" class="dialog-overlay" @click.self="$emit('cancel')">
      <div class="dialog" role="dialog">
        <p class="dialog-text">{{ message }}</p>
        <div class="dialog-actions">
          <button class="btn-danger" :disabled="loading" @click="$emit('confirm')">
            {{ confirmLabel }}
          </button>
          <button class="btn-secondary" :disabled="loading" @click="$emit('cancel')">
            {{ cancelLabel }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: false },
  message: { type: String, required: true },
  confirmLabel: { type: String, default: 'Delete' },
  cancelLabel: { type: String, default: 'Cancel' },
  loading: { type: Boolean, default: false },
})

defineEmits(['confirm', 'cancel'])
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
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
