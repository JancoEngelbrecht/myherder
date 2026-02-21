<template>
  <div class="sync-indicator" :class="syncStatus" :title="t(`sync.${syncStatus}`)">
    <span class="dot" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCowsStore } from '../../stores/cows.js'

const { t } = useI18n()
const cowsStore = useCowsStore()
const syncStatus = computed(() => cowsStore.syncStatus)
</script>

<style scoped>
.sync-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: block;
  transition: background 0.3s;
}

.synced .dot {
  background: #22C55E;
  box-shadow: 0 0 4px rgba(34,197,94,0.5);
}

.syncing .dot {
  background: var(--warning);
  box-shadow: 0 0 4px rgba(224,124,36,0.5);
  animation: pulse 1s infinite;
}

.offline .dot {
  background: var(--danger);
  box-shadow: 0 0 4px rgba(214,40,40,0.4);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
