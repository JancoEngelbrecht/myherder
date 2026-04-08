<script setup lang="ts">
import { computed } from 'vue'
import { iconMap } from '../../config/iconMap'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 20 },
  strokeWidth: { type: Number, default: 1.5 },
})

const icon = computed(() => iconMap[props.name] ?? null)
</script>

<template>
  <component :is="icon" v-if="icon" :size="size" :stroke-width="strokeWidth" />
</template>
