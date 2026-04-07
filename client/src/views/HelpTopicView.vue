<template>
  <div class="page">
    <AppHeader :title="topicTitle" show-back back-to="/help" />

    <div v-if="topicData" class="page-content">
      <!-- What is this? -->
      <section class="help-section">
        <h3 class="help-section-title">{{ t('help.sections.what') }}</h3>
        <p class="help-section-text">{{ t(`help.topics.${slug}.what`) }}</p>
      </section>

      <!-- When do I use it? -->
      <section class="help-section">
        <h3 class="help-section-title">{{ t('help.sections.when') }}</h3>
        <p class="help-section-text">{{ t(`help.topics.${slug}.when`) }}</p>
      </section>

      <!-- Flow Diagram -->
      <section class="help-section">
        <h3 class="help-section-title">{{ t('help.sections.flow') }}</h3>
        <FlowDiagram :steps="topicData.getSteps(t, slug)" />
      </section>

      <!-- Steps -->
      <section class="help-section">
        <h3 class="help-section-title">{{ t('help.sections.steps') }}</h3>
        <ol class="help-steps">
          <li v-for="(step, i) in steps" :key="i" class="help-step">
            <div class="help-step-text">{{ step }}</div>
          </li>
        </ol>
      </section>

      <!-- What happens next? -->
      <section class="help-section">
        <h3 class="help-section-title">{{ t('help.sections.next') }}</h3>
        <p class="help-section-text">{{ t(`help.topics.${slug}.next`) }}</p>
      </section>

      <!-- Tips -->
      <section v-if="tips.length" class="help-section">
        <h3 class="help-section-title">{{ t('help.sections.tips') }}</h3>
        <ul class="help-tips">
          <li v-for="(tip, i) in tips" :key="i" class="help-tip">{{ tip }}</li>
        </ul>
      </section>
    </div>

    <div v-else class="page-content">
      <div class="empty-state">
        <p>{{ t('help.topicNotFound') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppHeader from '../components/organisms/AppHeader.vue'
import FlowDiagram from '../components/molecules/FlowDiagram.vue'
import { helpTopics } from '../config/helpTopicData'

const { t, tm } = useI18n()
const route = useRoute()

const slug = computed(() => route.params.topic)
const topicData = computed(() => helpTopics[slug.value])
const topicTitle = computed(() =>
  topicData.value ? t(`help.topics.${slug.value}.title`) : t('help.title')
)

const steps = computed(() => {
  const raw = tm(`help.topics.${slug.value}.steps`)
  return Array.isArray(raw)
    ? raw.map((s) => (typeof s === 'object' ? s.value || String(s) : String(s)))
    : []
})

const tips = computed(() => {
  const raw = tm(`help.topics.${slug.value}.tips`)
  return Array.isArray(raw)
    ? raw.map((s) => (typeof s === 'object' ? s.value || String(s) : String(s)))
    : []
})
</script>

<style scoped>
.help-section {
  margin-bottom: 24px;
}

.help-section-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--primary-dark);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 8px;
}

.help-section-text {
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--text);
}

.help-steps {
  list-style: none;
  counter-reset: step-counter;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.help-step {
  counter-increment: step-counter;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.help-step::before {
  content: counter(step-counter);
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.help-step-text {
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--text);
  padding-top: 3px;
}

.help-tips {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.help-tip {
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--text);
  padding-left: 20px;
  position: relative;
}

.help-tip::before {
  content: '💡';
  position: absolute;
  left: 0;
  font-size: 0.75rem;
}
</style>
