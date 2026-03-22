<template>
  <Teleport to="body">
    <TransitionGroup
      name="toast"
      tag="div"
      class="toast-container"
      role="status"
      aria-live="polite"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast-${toast.type}`"
        @click="dismiss(toast.id)"
      >
        <span class="toast-msg">{{ toast.message }}</span>
        <button class="toast-close" :aria-label="t('common.dismiss')">&times;</button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useToast } from '../../composables/useToast'

const { t } = useI18n()
const { toasts, dismiss } = useToast()
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: calc(var(--nav-height) + var(--safe-bottom) + 12px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 400;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: calc(100% - 32px);
  max-width: 420px;
  pointer-events: none;
}

.toast {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  pointer-events: auto;
  box-shadow: var(--shadow);
  cursor: pointer;
}

.toast-error {
  background: var(--danger-light);
  color: var(--danger);
  border: 1px solid rgba(220, 38, 38, 0.2);
}

.toast-success {
  background: var(--success-light);
  color: var(--success);
  border: 1px solid rgba(4, 120, 87, 0.2);
}

.toast-warning {
  background: var(--warning-light);
  color: var(--warning);
  border: 1px solid rgba(217, 119, 6, 0.2);
}

.toast-msg {
  flex: 1;
  line-height: 1.3;
}

.toast-close {
  background: none;
  border: none;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  padding: 0 2px;
  width: auto;
}

.toast-close:hover {
  opacity: 1;
}

/* Transition */
.toast-enter-active {
  transition: all 0.3s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
