<template>
  <header class="app-header">
    <div class="header-left">
      <button v-if="showBack" class="btn-icon" :aria-label="t('common.back')" @click="handleBack">
        ‹
      </button>
    </div>

    <div class="header-title">
      <slot name="title">{{ title }}</slot>
    </div>

    <div class="header-right">
      <slot name="right">
        <div class="header-actions">
          <SyncIndicator @click="showSyncPanel = true" />
          <SyncPanel :show="showSyncPanel" @close="showSyncPanel = false" />
          <button class="lang-toggle" :title="locale === 'en' ? t('common.switchToAfrikaans') : t('common.switchToEnglish')" @click="toggleLang">
            {{ locale === 'en' ? 'AF' : 'EN' }}
          </button>
          <RouterLink v-if="showAvatar" to="/profile" class="avatar-circle" :aria-label="t('common.profile')">
            {{ initials }}
          </RouterLink>
        </div>
      </slot>
    </div>
  </header>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth.js'
import { getInitials } from '../../utils/initials.js'
import SyncIndicator from '../atoms/SyncIndicator.vue'
import SyncPanel from '../molecules/SyncPanel.vue'

const showSyncPanel = ref(false)
const authStore = useAuthStore()

const props = defineProps({
  title: { type: String, default: 'MyHerder' },
  showBack: { type: Boolean, default: false },
  backTo: { type: String, default: null },
  showAvatar: { type: Boolean, default: false },
})

const initials = computed(() => getInitials(authStore.user))

const router = useRouter()
const { t, locale } = useI18n()

function handleBack() {
  if (window.history.state?.back) {
    router.back()
  } else if (props.backTo) {
    router.push(props.backTo)
  } else {
    router.push('/')
  }
}

function toggleLang() {
  const next = locale.value === 'en' ? 'af' : 'en'
  locale.value = next
  localStorage.setItem('locale', next)
}
</script>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 8px;
  z-index: 200;
  box-shadow: var(--shadow-sm);
}

.header-left,
.header-right {
  min-width: 72px;
  display: flex;
  align-items: center;
}

.header-right {
  justify-content: flex-end;
}

.header-title {
  flex: 1;
  text-align: center;
  font-weight: 700;
  font-size: 1rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lang-toggle {
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-secondary);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
}

.lang-toggle:active {
  background: var(--border);
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  border: none;
  background: transparent;
  font-size: 1.5rem;
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s;
  line-height: 1;
}

.btn-icon:active {
  background: var(--border);
}

.avatar-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  text-decoration: none;
  line-height: 1;
  flex-shrink: 0;
}
</style>
