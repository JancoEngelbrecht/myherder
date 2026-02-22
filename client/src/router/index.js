import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/cows',
    name: 'cow-list',
    component: () => import('../views/CowListView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/cows/new',
    name: 'cow-new',
    component: () => import('../views/CowFormView.vue'),
    meta: { requiresAuth: true, requiresManage: true },
  },
  {
    path: '/cows/:id',
    name: 'cow-detail',
    component: () => import('../views/CowDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/cows/:id/treatments',
    name: 'cow-treatments',
    component: () => import('../views/CowTreatmentHistoryView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/cows/:id/edit',
    name: 'cow-edit',
    component: () => import('../views/CowFormView.vue'),
    meta: { requiresAuth: true, requiresManage: true },
  },
  {
    path: '/analytics',
    name: 'analytics',
    component: () => import('../views/AnalyticsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/log',
    name: 'log',
    component: () => import('../views/PlaceholderView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/log/treatment',
    name: 'log-treatment',
    component: () => import('../views/LogTreatmentView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/log/issue',
    name: 'log-issue',
    component: () => import('../views/LogIssueView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/treatments/:id',
    name: 'treatment-detail',
    component: () => import('../views/TreatmentDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/cows/:id/issues',
    name: 'cow-issues',
    component: () => import('../views/CowIssueHistoryView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/issues/:id',
    name: 'issue-detail',
    component: () => import('../views/IssueDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/health-issues',
    name: 'open-issues',
    component: () => import('../views/OpenIssuesView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/withdrawal',
    name: 'withdrawal',
    component: () => import('../views/WithdrawalListView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/admin/SettingsView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/medications',
    name: 'medications',
    component: () => import('../views/admin/MedicationManagement.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/issue-types',
    name: 'issue-types',
    component: () => import('../views/admin/IssueTypeManagement.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/milk',
    name: 'milk',
    component: () => import('../views/MilkRecordingView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/breed',
    name: 'breed',
    component: () => import('../views/BreedingHubView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/breed/log',
    name: 'breed-log',
    component: () => import('../views/LogBreedingView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/breed/edit/:id',
    name: 'breed-edit',
    component: () => import('../views/LogBreedingView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/breeding-event-types',
    name: 'breeding-event-types',
    component: () => import('../views/admin/BreedingEventTypeManagement.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/cows/:id/repro',
    name: 'cow-repro',
    component: () => import('../views/CowReproView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) {
    await authStore.hydrate()
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.requiresManage && !authStore.canManageCows) {
    return { name: 'cow-list' }
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { name: 'dashboard' }
  }

  if (to.path === '/login' && authStore.isAuthenticated) {
    return { name: 'dashboard' }
  }
})

export default router
