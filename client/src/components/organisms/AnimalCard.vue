<template>
  <RouterLink :to="`/animals/${animal.id}`" class="animal-card">
    <div class="animal-avatar" :class="`sex-${animal.sex}`">
      {{ animal.sex === 'male' ? speciesEmoji.male : speciesEmoji.female }}
    </div>

    <div class="animal-info">
      <div class="animal-top">
        <span class="animal-tag mono">{{ animal.tag_number }}</span>
        <span class="badge" :class="`badge-${animal.status}`">
          {{ t(`status.${animal.status}`) }}
        </span>
        <span v-if="lifePhase" class="badge" :class="`badge-phase-${lifePhase}`">
          {{ t(`lifePhase.${lifePhase}`) }}
        </span>
      </div>
      <div class="animal-name">{{ animal.name || '—' }}</div>
      <div class="animal-meta">
        {{ breedName }}
        <template
          v-if="
            animal.sex === 'male' && (animal.is_external || animal.purpose === 'ai_semen_donor')
          "
        >
          <span v-if="animal.is_external" class="bull-tag external">{{
            t('cowCard.external')
          }}</span>
          <span v-if="animal.purpose === 'ai_semen_donor'" class="bull-tag ai">{{
            t('cowCard.aiSemen')
          }}</span>
        </template>
      </div>
    </div>

    <div class="animal-chevron">›</div>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { computeLifePhase } from '../../stores/animals'
import { useBreedTypesStore } from '../../stores/breedTypes'
import { useSpeciesTerms } from '../../composables/useSpeciesTerms'

const { t } = useI18n()
const breedTypesStore = useBreedTypesStore()
const { emoji: speciesEmoji, lifePhasesConfig } = useSpeciesTerms()

const props = defineProps({
  animal: {
    type: Object,
    required: true,
  },
})

const breedName = computed(() => {
  if (props.animal.breed_type_name) return props.animal.breed_type_name
  if (props.animal.breed_type_id) {
    const bt = breedTypesStore.getById(props.animal.breed_type_id)
    return bt?.name || props.animal.breed || '—'
  }
  return props.animal.breed || '—'
})

const lifePhase = computed(() => {
  const bt = props.animal.breed_type_id ? breedTypesStore.getById(props.animal.breed_type_id) : null
  return computeLifePhase(props.animal, bt, lifePhasesConfig.value)
})
</script>

<style scoped>
/* 3.6 — subtle left-border accent + softer shadow */
.animal-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid rgba(4, 120, 87, 0.2);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  text-decoration: none;
  color: var(--text);
  transition:
    transform 0.15s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
  cursor: pointer;
}

/* 3.8 — desktop hover lift */
@media (hover: hover) {
  .animal-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow);
    border-color: var(--border-strong);
    border-left-color: rgba(4, 120, 87, 0.45);
  }
}

.animal-card:active {
  transform: scale(0.985);
  box-shadow: none;
}

.animal-avatar {
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
  background: var(--sex-female-bg);
}

.sex-male {
  background: var(--sex-male-bg);
}

.animal-info {
  flex: 1;
  min-width: 0;
}

/* 3.7 — tighter badge grouping */
.animal-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
  flex-wrap: nowrap;
  overflow: hidden;
}

.animal-tag {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--primary);
  flex-shrink: 0;
}

.animal-name {
  font-weight: 600;
  font-size: 0.9375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.animal-meta {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bull-tag {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 6px;
  margin-left: 6px;
  vertical-align: middle;
}

.bull-tag.external {
  background: var(--warning-light);
  color: var(--warning-dark);
}

.bull-tag.ai {
  background: var(--info-light);
  color: var(--announce-info-text);
}

.animal-chevron {
  font-size: 1.25rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* 3.8 — desktop grid card layout */
@media (min-width: 600px) {
  .animal-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 16px 16px 16px 14px;
  }

  .animal-avatar {
    width: 52px;
    height: 52px;
    font-size: 1.75rem;
  }

  .animal-chevron {
    display: none;
  }

  .animal-name {
    white-space: normal;
  }

  .animal-meta {
    white-space: normal;
  }

  /* 3.7 — badges wrap on desktop cards */
  .animal-top {
    flex-wrap: wrap;
    overflow: visible;
  }
}
</style>
