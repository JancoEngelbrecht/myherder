<template>
  <RouterLink :to="`/cows/${cow.id}`" class="cow-card">
    <div class="cow-avatar" :class="`sex-${cow.sex}`">
      {{ cow.sex === 'male' ? '🐂' : '🐄' }}
    </div>

    <div class="cow-info">
      <div class="cow-top">
        <span class="cow-tag mono">{{ cow.tag_number }}</span>
        <span class="badge" :class="`badge-${cow.status}`">
          {{ t(`status.${cow.status}`) }}
        </span>
        <span v-if="lifePhase" class="badge" :class="`badge-phase-${lifePhase}`">
          {{ t(`lifePhase.${lifePhase}`) }}
        </span>
      </div>
      <div class="cow-name">{{ cow.name || '—' }}</div>
      <div class="cow-meta">{{ cow.breed_type_name || cow.breed || '—' }}</div>
    </div>

    <div class="cow-chevron">›</div>
  </RouterLink>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { computeLifePhase } from '../../stores/cows.js'
import { useBreedTypesStore } from '../../stores/breedTypes.js'

const { t } = useI18n()
const breedTypesStore = useBreedTypesStore()

const props = defineProps({
  cow: {
    type: Object,
    required: true,
  },
})

const lifePhase = computed(() => {
  const bt = props.cow.breed_type_id ? breedTypesStore.getById(props.cow.breed_type_id) : null
  return computeLifePhase(props.cow, bt)
})
</script>

<style scoped>
.cow-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  text-decoration: none;
  color: var(--text);
  transition: transform 0.1s, box-shadow 0.1s;
  cursor: pointer;
}

.cow-card:active {
  transform: scale(0.985);
  box-shadow: none;
}

.cow-avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
}

.sex-female {
  background: #FFF0F6;
}

.sex-male {
  background: #EFF6FF;
}

.cow-info {
  flex: 1;
  min-width: 0;
}

.cow-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.cow-tag {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--primary);
}

.cow-name {
  font-weight: 600;
  font-size: 0.9375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cow-meta {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cow-chevron {
  font-size: 1.25rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

@media (min-width: 600px) {
  .cow-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 16px;
  }

  .cow-avatar {
    width: 52px;
    height: 52px;
    font-size: 1.75rem;
  }

  .cow-chevron {
    display: none;
  }

  .cow-name {
    white-space: normal;
  }

  .cow-meta {
    white-space: normal;
  }
}
</style>
