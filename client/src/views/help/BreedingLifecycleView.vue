<template>
  <div class="page">
    <AppHeader :title="t('help.topics.breeding-lifecycle.title')" show-back back-to="/help" />

    <div class="page-content">
      <!-- Overview -->
      <section class="help-section">
        <h3 class="help-section-title">{{ t('help.sections.what') }}</h3>
        <p class="help-section-text">{{ t('help.topics.breeding-lifecycle.what') }}</p>
      </section>

      <!-- Main cycle diagram -->
      <section class="help-section">
        <h3 class="help-section-title">{{ t('help.breedingCycle.mainCycleTitle') }}</h3>
        <FlowDiagram :steps="mainCycleSteps" />
      </section>

      <!-- Edge cases -->
      <section class="help-section">
        <h3 class="help-section-title">{{ t('help.breedingCycle.edgeCasesTitle') }}</h3>

        <div class="edge-case-card">
          <h4 class="edge-case-name">{{ t('help.breedingCycle.negativePreg.title') }}</h4>
          <p class="edge-case-desc">{{ t('help.breedingCycle.negativePreg.desc') }}</p>
          <FlowDiagram :steps="negativePregSteps" />
        </div>

        <div class="edge-case-card">
          <h4 class="edge-case-name">{{ t('help.breedingCycle.abortion.title') }}</h4>
          <p class="edge-case-desc">{{ t('help.breedingCycle.abortion.desc') }}</p>
          <FlowDiagram :steps="abortionSteps" />
        </div>

        <div class="edge-case-card">
          <h4 class="edge-case-name">{{ t('help.breedingCycle.repeatBreeder.title') }}</h4>
          <p class="edge-case-desc">{{ t('help.breedingCycle.repeatBreeder.desc') }}</p>
        </div>

        <div class="edge-case-card">
          <h4 class="edge-case-name">{{ t('help.breedingCycle.missedHeat.title') }}</h4>
          <p class="edge-case-desc">{{ t('help.breedingCycle.missedHeat.desc') }}</p>
        </div>
      </section>

      <!-- Tips -->
      <section class="help-section">
        <h3 class="help-section-title">{{ t('help.sections.tips') }}</h3>
        <ul class="help-tips">
          <li v-for="(tip, i) in tips" :key="i" class="help-tip">{{ tip }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import FlowDiagram from '../../components/molecules/FlowDiagram.vue'

const { t, tm } = useI18n()

const mainCycleSteps = computed(() => [
  { label: t('help.breedingCycle.steps.heatDetection'), type: 'action', icon: '🌡' },
  { label: t('help.breedingCycle.steps.insemination'), type: 'action', icon: '💉' },
  { label: t('help.breedingCycle.steps.waitPregCheck'), type: 'system', icon: '⏳' },
  {
    label: t('help.breedingCycle.steps.pregCheck'),
    type: 'decision',
    icon: '🤰',
    branches: [
      {
        label: t('common.yes'),
        nodeLabel: t('help.breedingCycle.steps.pregnant'),
        type: 'yes',
        icon: '✅',
      },
      {
        label: t('common.no'),
        nodeLabel: t('help.breedingCycle.steps.notPregnant'),
        type: 'no',
        icon: '🔄',
      },
    ],
  },
  { label: t('help.breedingCycle.steps.dryOff'), type: 'action', icon: '🚫' },
  { label: t('help.breedingCycle.steps.calving'), type: 'action', icon: '🐄' },
  { label: t('help.breedingCycle.steps.recovery'), type: 'system', icon: '💚' },
  { label: t('help.breedingCycle.steps.cycleRestart'), type: 'system', icon: '🔄' },
])

const negativePregSteps = computed(() => [
  { label: t('help.breedingCycle.steps.pregCheckNeg'), type: 'decision', icon: '❌' },
  { label: t('help.breedingCycle.steps.backToHeat'), type: 'system', icon: '🔄' },
  { label: t('help.breedingCycle.steps.reInseminate'), type: 'action', icon: '💉' },
])

const abortionSteps = computed(() => [
  { label: t('help.breedingCycle.steps.abortionDetected'), type: 'action', icon: '⚠' },
  { label: t('help.breedingCycle.steps.vetCheck'), type: 'action', icon: '🩺' },
  { label: t('help.breedingCycle.steps.recoveryPeriod'), type: 'system', icon: '⏳' },
  { label: t('help.breedingCycle.steps.backToHeat'), type: 'system', icon: '🔄' },
])

const tips = computed(() => {
  const raw = tm('help.topics.breeding-lifecycle.tips')
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

.edge-case-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
}

.edge-case-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 6px;
}

.edge-case-desc {
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--text-secondary);
  margin-bottom: 12px;
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
