<template>
  <div class="page">
    <AppHeader :title="$t('healthIssues.logTitle')" show-back :back-to="backRoute" />

    <div class="content">
      <form @submit.prevent="submit">
        <!-- Cow selector -->
        <div class="form-group">
          <label>{{ $t('healthIssues.cow') }} *</label>
          <CowSearchDropdown
            v-model="form.cow_id"
            :placeholder="$t('healthIssues.cowPlaceholder')"
            :error="errors.cow_id"
          />
        </div>

        <!-- Issue type — big button grid (multi-select) -->
        <div class="form-group">
          <label>
            {{ $t('healthIssues.issueType') }} *
            <span class="label-hint">{{ $t('healthIssues.issueTypeHint') }}</span>
          </label>
          <div class="issue-grid">
            <button
              v-for="type in issueTypes"
              :key="type.code"
              type="button"
              class="issue-btn"
              :class="{ selected: form.issue_types.includes(type.code) }"
              @click="toggleIssueType(type.code)"
            >
              <span class="issue-emoji">{{ type.emoji }}</span>
              <span class="issue-label">{{ type.name }}</span>
            </button>
          </div>
          <span v-if="errors.issue_types" class="field-error">{{ errors.issue_types }}</span>
        </div>

        <!-- Severity — 3 big buttons -->
        <div class="form-group">
          <label>{{ $t('healthIssues.severity') }}</label>
          <div class="severity-row">
            <button
              v-for="sev in severities"
              :key="sev.value"
              type="button"
              class="severity-btn"
              :class="[`sev-${sev.value}`, { selected: form.severity === sev.value }]"
              @click="form.severity = sev.value"
            >
              {{ $t(`healthIssues.${sev.value}`) }}
            </button>
          </div>
        </div>

        <!-- Teat selector — conditional -->
        <div v-if="showTeatSelector" class="form-group">
          <TeatSelector v-model="form.affected_teats" />
        </div>

        <!-- Observed date -->
        <div class="form-group">
          <label for="observed-at">{{ $t('healthIssues.observed') }} *</label>
          <input
            id="observed-at"
            v-model="form.observed_at"
            type="datetime-local"
            class="form-input"
            required
          />
        </div>

        <!-- Description / notes -->
        <div class="form-group">
          <label for="description">{{ $t('healthIssues.description') }}</label>
          <textarea
            id="description"
            v-model="form.description"
            class="form-input"
            rows="3"
            :placeholder="$t('healthIssues.descriptionPlaceholder')"
          />
        </div>

        <p v-if="submitError" class="submit-error">{{ submitError }}</p>

        <button type="submit" class="btn-primary btn-full" :disabled="submitting">
          {{ submitting ? $t('common.saving') : $t('healthIssues.logIssue') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useHealthIssuesStore } from '../stores/healthIssues'
import { useIssueTypesStore } from '../stores/issueTypes'
import AppHeader from '../components/organisms/AppHeader.vue'
import CowSearchDropdown from '../components/molecules/CowSearchDropdown.vue'
import TeatSelector from '../components/molecules/TeatSelector.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const healthIssuesStore = useHealthIssuesStore()
const issueTypesStore = useIssueTypesStore()

const prefillCowId = route.query.cow_id || ''
const backRoute = prefillCowId ? `/cows/${prefillCowId}` : '/log'

const issueTypes = computed(() => issueTypesStore.activeTypes)

const severities = [
  { value: 'low' },
  { value: 'medium' },
  { value: 'high' },
]

function localNow() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const form = ref({
  cow_id: prefillCowId,
  issue_types: [],
  severity: 'medium',
  affected_teats: [],
  observed_at: localNow(),
  description: '',
})

const errors = ref({})
const submitting = ref(false)
const submitError = ref('')

watch(form, () => { submitError.value = '' }, { deep: true })

const showTeatSelector = computed(() =>
  form.value.issue_types.some((code) => issueTypesStore.getByCode(code)?.requires_teat_selection),
)

function toggleIssueType(value) {
  const idx = form.value.issue_types.indexOf(value)
  if (idx === -1) {
    form.value.issue_types.push(value)
  } else {
    form.value.issue_types.splice(idx, 1)
  }
}

// Clear teats when no selected type requires teat selection
watch(() => form.value.issue_types, (types) => {
  const needsTeats = types.some((code) => issueTypesStore.getByCode(code)?.requires_teat_selection)
  if (!needsTeats) form.value.affected_teats = []
}, { deep: true })

onMounted(() => issueTypesStore.fetchAll())

async function submit() {
  errors.value = {}
  submitError.value = ''

  const cowId = form.value.cow_id?.toString().trim() || ''
  if (!cowId) errors.value.cow_id = t('common.required')
  if (!form.value.issue_types.length) errors.value.issue_types = t('common.required')
  if (Object.keys(errors.value).length) return

  submitting.value = true
  const payload = {
    cow_id: cowId,
    issue_types: form.value.issue_types,
    severity: form.value.severity,
    affected_teats: form.value.affected_teats.length ? form.value.affected_teats : null,
    description: form.value.description || null,
    observed_at: new Date(form.value.observed_at).toISOString(),
  }
  try {
    await healthIssuesStore.create(payload)
    router.push(backRoute)
  } catch (err) {
    submitError.value = err.response?.data?.error || err.message
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.content {
  padding: 80px 16px 100px;
  max-width: 540px;
  margin: 0 auto;
}

.label-hint {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 6px;
}

.field-error {
  color: var(--danger);
  font-size: 0.8rem;
  margin-top: 4px;
  display: block;
}

/* Issue type grid */
.issue-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 6px;
}

.issue-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 14px 8px;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  min-height: 80px;
}

.issue-btn:hover {
  border-color: var(--primary);
  background: var(--primary-bg, #f0f7f4);
}

.issue-btn.selected {
  border-color: var(--primary);
  background: var(--primary-bg, #f0f7f4);
  box-shadow: 0 0 0 2px var(--primary);
}

.issue-emoji {
  font-size: 1.75rem;
  line-height: 1;
}

.issue-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: center;
  color: var(--text);
}

/* Severity buttons */
.severity-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 6px;
}

.severity-btn {
  padding: 14px 8px;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-weight: 700;
  font-size: 0.875rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.severity-btn.sev-low.selected {
  border-color: #4CAF50;
  background: #f1f8e9;
  color: #2e7d32;
}

.severity-btn.sev-medium.selected {
  border-color: var(--warning);
  background: #fff8e1;
  color: #e07c24;
}

.severity-btn.sev-high.selected {
  border-color: var(--danger);
  background: #fce4e4;
  color: var(--danger);
}

.severity-btn:not(.selected):hover {
  border-color: var(--primary);
}

.submit-error {
  color: var(--danger);
  font-size: 0.85rem;
  margin-bottom: 12px;
}

.btn-full {
  width: 100%;
  padding: 16px;
  font-size: 1rem;
  margin-top: 8px;
}
</style>
