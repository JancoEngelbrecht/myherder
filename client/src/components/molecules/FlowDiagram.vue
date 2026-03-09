<template>
  <div class="flow-diagram" :class="{ 'flow-horizontal': direction === 'horizontal' }">
    <div
      v-for="(step, idx) in steps"
      :key="step.id || idx"
      class="flow-step"
    >
      <div class="flow-node" :class="`flow-node--${step.type || 'action'}`">
        <span v-if="step.icon" class="flow-node-icon">{{ step.icon }}</span>
        <span class="flow-node-label">{{ step.label }}</span>
      </div>

      <!-- Branch (decision) -->
      <div v-if="step.branches" class="flow-branches">
        <div
          v-for="(branch, bIdx) in step.branches"
          :key="bIdx"
          class="flow-branch"
        >
          <div class="flow-branch-label" :class="branch.type === 'yes' ? 'branch-yes' : 'branch-no'">
            {{ branch.label }}
          </div>
          <div class="flow-branch-arrow">↓</div>
          <div class="flow-node" :class="`flow-node--${branch.nodeType || 'system'}`">
            <span v-if="branch.icon" class="flow-node-icon">{{ branch.icon }}</span>
            <span class="flow-node-label">{{ branch.nodeLabel }}</span>
          </div>
        </div>
      </div>

      <!-- Arrow between steps -->
      <div v-if="idx < steps.length - 1 && !step.branches" class="flow-arrow">
        <span class="flow-arrow-line"></span>
        <span class="flow-arrow-head">▼</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  steps: {
    type: Array,
    required: true,
    // Each step: { id?, label, type: 'action'|'system'|'decision', icon?, branches? }
    // branches: [{ label, nodeLabel, nodeType?, icon?, type: 'yes'|'no' }]
  },
  direction: {
    type: String,
    default: 'vertical',
  },
})
</script>

<style scoped>
.flow-diagram {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 16px 0;
}

.flow-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 320px;
}

.flow-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: var(--radius);
  width: 100%;
  text-align: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.4;
}

.flow-node--action {
  background: var(--surface);
  border: 2px solid var(--primary);
  color: var(--text);
}

.flow-node--system {
  background: var(--primary-bg);
  border: 2px dashed var(--primary-light);
  color: var(--primary-dark);
}

.flow-node--decision {
  background: var(--warning-light);
  border: 2px solid var(--warning);
  color: var(--text);
  border-radius: var(--radius-sm);
  position: relative;
}

.flow-node--decision::before {
  content: '?';
  position: absolute;
  left: -8px;
  top: -8px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--warning);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.flow-node-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
}

.flow-node-label {
  flex: 1;
}

/* Arrows */
.flow-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2px 0;
  color: var(--text-muted);
}

.flow-arrow-line {
  width: 2px;
  height: 16px;
  background: var(--border-strong);
}

.flow-arrow-head {
  font-size: 0.625rem;
  color: var(--border-strong);
  line-height: 1;
}

/* Branches */
.flow-branches {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  width: 100%;
  max-width: 360px;
}

.flow-branch {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.flow-branch-label {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.branch-yes {
  background: var(--success-light);
  color: var(--primary-dark);
}

.branch-no {
  background: var(--danger-light);
  color: var(--danger);
}

.flow-branch-arrow {
  color: var(--border-strong);
  font-size: 0.75rem;
}

.flow-branch .flow-node {
  font-size: 0.8125rem;
  padding: 10px 12px;
}

/* Horizontal variant */
.flow-horizontal {
  flex-direction: row;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
  gap: 0;
}

.flow-horizontal .flow-step {
  flex-direction: row;
  max-width: none;
  width: auto;
  flex-shrink: 0;
}

.flow-horizontal .flow-arrow {
  flex-direction: row;
  padding: 0 4px;
}

.flow-horizontal .flow-arrow-line {
  width: 16px;
  height: 2px;
}

.flow-horizontal .flow-arrow-head {
  transform: rotate(-90deg);
}
</style>
