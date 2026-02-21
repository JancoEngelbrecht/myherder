<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  total: { type: Number, required: true },
  page: { type: Number, required: true },
  limit: { type: Number, required: true },
  pageSizeOptions: { type: Array, default: () => [20, 50, 100] },
})

const emit = defineEmits(['update:page', 'update:limit'])

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.limit)))
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.limit + 1))
const to = computed(() => Math.min(props.page * props.limit, props.total))

// Show up to 5 page buttons, centered around current page
const visiblePages = computed(() => {
  const total = totalPages.value
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  let start = Math.max(1, props.page - 2)
  const end = Math.min(total, start + 4)
  if (end - start < 4) start = Math.max(1, end - 4)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})

function goTo(p) {
  if (p >= 1 && p <= totalPages.value && p !== props.page) {
    emit('update:page', p)
  }
}

function onLimitChange(e) {
  emit('update:limit', Number(e.target.value))
  emit('update:page', 1)
}
</script>

<template>
  <div v-if="total > 0" class="pagination-bar">
    <span class="pagination-info mono">
      {{ t('common.pagination.showing', { from, to, total }) }}
    </span>

    <div class="pagination-pages">
      <button
        class="page-btn"
        :disabled="page <= 1"
        :aria-label="t('common.pagination.previous')"
        @click="goTo(page - 1)"
      >
        ‹
      </button>

      <button
        v-for="p in visiblePages"
        :key="p"
        class="page-btn"
        :class="{ active: p === page }"
        @click="goTo(p)"
      >
        {{ p }}
      </button>

      <button
        class="page-btn"
        :disabled="page >= totalPages"
        :aria-label="t('common.pagination.next')"
        @click="goTo(page + 1)"
      >
        ›
      </button>
    </div>

    <div class="pagination-size">
      <label class="size-label">{{ t('common.pagination.perPage') }}</label>
      <select class="size-select" :value="limit" @change="onLimitChange">
        <option v-for="opt in pageSizeOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.pagination-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 0;
  justify-content: space-between;
}

.pagination-info {
  color: var(--text-secondary);
  font-size: 13px;
  flex: 1 1 auto;
}

.pagination-pages {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-btn {
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  transition: all 0.15s;
  line-height: 1;
}

.page-btn:hover:not(:disabled):not(.active) {
  border-color: var(--primary);
  color: var(--primary);
}

.page-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  font-weight: 600;
}

.page-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.pagination-size {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.size-select {
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

@media (max-width: 480px) {
  .pagination-bar {
    justify-content: center;
  }

  .pagination-info {
    text-align: center;
    flex: 1 1 100%;
  }
}
</style>
