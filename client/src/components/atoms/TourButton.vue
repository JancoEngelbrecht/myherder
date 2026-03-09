<template>
  <button class="tour-btn" :class="{ 'tour-btn--above-fab': aboveFab }" :title="t('tour.startTour')" @click="$emit('start-tour')">
    <span class="tour-btn-icon">?</span>
  </button>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  aboveFab: { type: Boolean, default: false },
})
defineEmits(['start-tour'])
const { t } = useI18n()
</script>

<style scoped>
.tour-btn {
  position: fixed;
  bottom: calc(var(--nav-height) + 16px);
  right: 16px;
  z-index: 90;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  border: 2px solid var(--primary);
  background: var(--surface);
  color: var(--primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow);
  transition: background 0.2s, color 0.2s;
}

.tour-btn--above-fab {
  bottom: calc(var(--nav-height) + 16px + 56px + 12px);
}

.tour-btn:active {
  background: var(--primary);
  color: var(--text-on-primary);
}

.tour-btn-icon {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 1.125rem;
  line-height: 1;
}
</style>
