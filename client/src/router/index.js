import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useFeatureFlagsStore } from '../stores/featureFlags.js'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/login/super',
    name: 'super-admin-login',
    component: () => import('../views/SuperAdminLoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/auth/2fa',
    name: 'two-factor-verify',
    component: () => import('../views/TwoFactorVerifyView.vue'),
    meta: { public: true },
  },
  {
    path: '/auth/setup-2fa',
    name: 'two-factor-setup',
    component: () => import('../views/TwoFactorSetupView.vue'),
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
    meta: { requiresAuth: true, requiresPermission: 'can_manage_cows' },
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
    meta: { requiresAuth: true, requiresModule: 'treatments', requiresPermission: 'can_log_treatments' },
  },
  {
    path: '/cows/:id/edit',
    name: 'cow-edit',
    component: () => import('../views/CowFormView.vue'),
    meta: { requiresAuth: true, requiresPermission: 'can_manage_cows' },
  },
  {
    path: '/analytics',
    name: 'analytics',
    component: () => import('../views/AnalyticsView.vue'),
    meta: { requiresAuth: true, requiresModule: 'analytics', requiresPermission: 'can_view_analytics' },
  },
  {
    path: '/analytics/financial',
    name: 'analytics-financial',
    component: () => import('../views/analytics/FinancialView.vue'),
    meta: { requiresAuth: true, requiresModule: 'analytics', requiresPermission: 'can_view_analytics' },
  },
  {
    path: '/analytics/fertility',
    name: 'analytics-fertility',
    component: () => import('../views/analytics/FertilityView.vue'),
    meta: { requiresAuth: true, requiresModule: 'analytics', requiresPermission: 'can_view_analytics' },
  },
  {
    path: '/analytics/health',
    name: 'analytics-health',
    component: () => import('../views/analytics/HealthView.vue'),
    meta: { requiresAuth: true, requiresModule: 'analytics', requiresPermission: 'can_view_analytics' },
  },
  {
    path: '/analytics/structure',
    name: 'analytics-structure',
    component: () => import('../views/analytics/StructureView.vue'),
    meta: { requiresAuth: true, requiresModule: 'analytics', requiresPermission: 'can_view_analytics' },
  },
  {
    path: '/log/treatment',
    name: 'log-treatment',
    component: () => import('../views/LogTreatmentView.vue'),
    meta: { requiresAuth: true, requiresModule: 'treatments', requiresPermission: 'can_log_treatments' },
  },
  {
    path: '/log/issue',
    name: 'log-issue',
    component: () => import('../views/LogIssueView.vue'),
    meta: { requiresAuth: true, requiresModule: 'healthIssues', requiresPermission: 'can_log_issues' },
  },
  {
    path: '/treatments/:id',
    name: 'treatment-detail',
    component: () => import('../views/TreatmentDetailView.vue'),
    meta: { requiresAuth: true, requiresModule: 'treatments', requiresPermission: 'can_log_treatments' },
  },
  {
    path: '/cows/:id/issues',
    name: 'cow-issues',
    component: () => import('../views/CowIssueHistoryView.vue'),
    meta: { requiresAuth: true, requiresModule: 'healthIssues', requiresPermission: 'can_log_issues' },
  },
  {
    path: '/issues/:id',
    name: 'issue-detail',
    component: () => import('../views/IssueDetailView.vue'),
    meta: { requiresAuth: true, requiresModule: 'healthIssues', requiresPermission: 'can_log_issues' },
  },
  {
    path: '/health-issues',
    name: 'open-issues',
    component: () => import('../views/OpenIssuesView.vue'),
    meta: { requiresAuth: true, requiresModule: 'healthIssues', requiresPermission: 'can_log_issues' },
  },
  {
    path: '/withdrawal',
    name: 'withdrawal',
    component: () => import('../views/WithdrawalListView.vue'),
    meta: { requiresAuth: true, requiresModule: 'treatments', requiresPermission: 'can_log_treatments' },
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
    meta: { requiresAuth: true, requiresAdmin: true, requiresModule: 'treatments' },
  },
  {
    path: '/admin/issue-types',
    name: 'issue-types',
    component: () => import('../views/admin/IssueTypeManagement.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, requiresModule: 'healthIssues' },
  },
  {
    path: '/milk',
    name: 'milk',
    component: () => import('../views/MilkRecordingView.vue'),
    meta: { requiresAuth: true, requiresModule: 'milkRecording', requiresPermission: 'can_record_milk' },
  },
  {
    path: '/milk/history',
    name: 'milk-history',
    component: () => import('../views/MilkHistoryView.vue'),
    meta: { requiresAuth: true, requiresModule: 'milkRecording', requiresPermission: 'can_record_milk' },
  },
  {
    path: '/breed',
    name: 'breed',
    component: () => import('../views/BreedingHubView.vue'),
    meta: { requiresAuth: true, requiresModule: 'breeding', requiresPermission: 'can_log_breeding' },
  },
  {
    path: '/breed/notifications',
    name: 'breed-notifications',
    component: () => import('../views/BreedingNotificationsView.vue'),
    meta: { requiresAuth: true, requiresModule: 'breeding', requiresPermission: 'can_log_breeding' },
  },
  {
    path: '/breed/events',
    name: 'breed-events',
    component: () => import('../views/BreedingEventsView.vue'),
    meta: { requiresAuth: true, requiresModule: 'breeding', requiresPermission: 'can_log_breeding' },
  },
  {
    path: '/breed/log',
    name: 'breed-log',
    component: () => import('../views/LogBreedingView.vue'),
    meta: { requiresAuth: true, requiresModule: 'breeding', requiresPermission: 'can_log_breeding' },
  },
  {
    path: '/breed/edit/:id',
    name: 'breed-edit',
    component: () => import('../views/LogBreedingView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, requiresModule: 'breeding' },
  },
  {
    path: '/admin/users',
    name: 'user-management',
    component: () => import('../views/admin/UserManagement.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/audit-log',
    name: 'audit-log',
    component: () => import('../views/admin/AuditLogView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/breed-types',
    name: 'breed-types',
    component: () => import('../views/admin/BreedTypeManagement.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, requiresModule: 'breeding' },
  },
  {
    path: '/admin/reports',
    name: 'reports',
    component: () => import('../views/admin/ReportsView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/cows/:id/repro',
    name: 'cow-repro',
    component: () => import('../views/CowReproView.vue'),
    meta: { requiresAuth: true, requiresModule: 'breeding', requiresPermission: 'can_log_breeding' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/ProfileView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/help',
    name: 'help-library',
    component: () => import('../views/HelpLibraryView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/help/breeding-lifecycle',
    name: 'help-breeding-lifecycle',
    component: () => import('../views/help/BreedingLifecycleView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/help/:topic',
    name: 'help-topic',
    component: () => import('../views/HelpTopicView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/super/farms',
    name: 'farm-list',
    component: () => import('../views/super/FarmListView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
  },
  {
    path: '/super/farms/new',
    name: 'farm-create',
    component: () => import('../views/super/CreateFarmView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
  },
  {
    path: '/super/farms/:id',
    name: 'farm-detail',
    component: () => import('../views/super/FarmDetailView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
  },
  {
    path: '/super/defaults',
    name: 'defaults-hub',
    component: () => import('../views/super/DefaultsHubView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
  },
  {
    path: '/super/global/medications',
    name: 'global-medications',
    component: () => import('../views/super/DefaultMedicationsView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
  },
  {
    path: '/super/global/issue-types',
    name: 'global-issue-types',
    component: () => import('../views/super/DefaultIssueTypesView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
  },
  {
    path: '/super/global/breed-types',
    name: 'global-breed-types',
    component: () => import('../views/super/DefaultBreedTypesView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
  },
  {
    path: '/super/global/push',
    name: 'global-push',
    component: () => import('../views/super/PushDefaultsView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
  },
  {
    path: '/super/announcements',
    name: 'announcement-management',
    component: () => import('../views/super/AnnouncementsView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
  },
  {
    path: '/super/system-health',
    name: 'system-health',
    component: () => import('../views/super/SystemHealthView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
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

  if (to.meta.requiresSuperAdmin && (!authStore.isSuperAdmin || authStore.isInFarmContext)) {
    return { name: 'dashboard' }
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { name: 'dashboard' }
  }

  if (to.meta.requiresPermission && !authStore.hasPermission(to.meta.requiresPermission)) {
    return { name: 'dashboard' }
  }

  // Module flag gating
  if (to.meta.requiresModule) {
    const featureFlagsStore = useFeatureFlagsStore()
    if (!featureFlagsStore.flags[to.meta.requiresModule]) {
      return { name: 'dashboard' }
    }
  }

  // Redirect authenticated users away from login and 2FA routes
  if ((to.path === '/login' || to.path === '/login/super') && authStore.isAuthenticated) {
    return { name: 'dashboard' }
  }

  // 2FA routes require a temp token but no full auth
  if (to.path.startsWith('/auth/')) {
    if (authStore.isAuthenticated) {
      return { name: 'dashboard' }
    }
    if (!authStore.tempToken) {
      return { name: 'login' }
    }
  }
})

export default router
