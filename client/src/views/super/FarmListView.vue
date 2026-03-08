<template>
  <div class="page">
    <AppHeader :title="t('superAdmin.farms')" show-back back-to="/" show-avatar />

    <div class="page-content">
      <div class="list-header">
        <RouterLink to="/super/farms/new" class="btn-primary btn-sm-pill">
          + {{ t('superAdmin.createFarm') }}
        </RouterLink>
      </div>

      <div v-if="loading" class="empty-state"><span class="spinner" /></div>

      <div v-else-if="farms.length === 0" class="empty-state">
        <p>{{ t('superAdmin.noFarms') }}</p>
      </div>

      <div v-else class="farm-list">
        <div v-for="farm in farms" :key="farm.id" class="card farm-card">
          <div class="farm-header">
            <div>
              <h3 class="farm-name">{{ farm.name }}</h3>
              <span class="mono farm-code">{{ farm.code }}</span>
            </div>
            <span :class="['badge', farm.is_active ? 'badge-active' : 'badge-inactive']">
              {{ farm.is_active ? t('superAdmin.active') : t('superAdmin.inactive') }}
            </span>
          </div>

          <div class="farm-stats">
            <span class="farm-stat">{{ farm.user_count }} {{ t('superAdmin.users') }}</span>
            <span class="farm-stat">{{ farm.cow_count }} {{ t('superAdmin.cows') }}</span>
          </div>

          <div class="farm-actions">
            <RouterLink :to="`/super/farms/${farm.id}`" class="btn-secondary btn-sm-pill">
              {{ t('common.view') }}
            </RouterLink>
            <button class="btn-primary btn-sm-pill" @click="handleEnter(farm)">
              {{ t('superAdmin.enterFarm') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import api from '../../services/api.js'
import AppHeader from '../../components/organisms/AppHeader.vue'
import { useToast } from '../../composables/useToast.js'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const { showToast } = useToast()

const farms = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const { data } = await api.get('/farms')
    farms.value = data
  } catch {
    showToast(t('common.error'), 'error')
  } finally {
    loading.value = false
  }
})

async function handleEnter(farm) {
  try {
    await authStore.enterFarm(farm.id)
    router.push('/')
  } catch {
    showToast(t('common.error'), 'error')
  }
}
</script>

<style scoped>
.list-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.farm-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.farm-card {
  padding: 16px;
}

.farm-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.farm-name {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 4px;
}

.farm-code {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.farm-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.farm-stat {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.farm-actions {
  display: flex;
  gap: 8px;
}

.farm-actions .btn-primary,
.farm-actions .btn-secondary {
  width: auto;
  flex: 0 1 auto;
}

.badge-active {
  background: var(--success-light);
  color: var(--primary-dark);
}

.badge-inactive {
  background: var(--danger-light);
  color: var(--danger);
}
</style>
