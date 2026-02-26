---
name: vue-patterns
description: Load when building Vue 3 components. Covers Composition API, Pinia stores, vue-router, vue-i18n, and component patterns.
---

# Vue 3 Patterns

## Component Structure

Order sections consistently in every SFC:

```vue
<script setup lang="ts">
// 1. Imports
// 2. Props & emits
// 3. Composables (useRouter, useStore, etc.)
// 4. Reactive state (ref, reactive, computed)
// 5. Watchers
// 6. Functions
// 7. Lifecycle hooks (onMounted, etc.)
</script>

<template>
  <!-- Single root or use fragments -->
</template>

<style scoped>
/* Component-scoped styles */
</style>
```

## Props & Emits

```typescript
// Always type props with interface
interface Props {
  userId: number
  showAvatar?: boolean  // optional with default
}

const props = withDefaults(defineProps<Props>(), {
  showAvatar: true,
})

// Always type emits
const emit = defineEmits<{
  update: [value: string]
  delete: [id: number]
}>()
```

## Composables

Extract reusable logic into composables (use* prefix):

```typescript
// composables/useUserSearch.ts
export function useUserSearch() {
  const query = ref('')
  const results = ref<User[]>([])
  const isLoading = ref(false)

  const search = useDebounceFn(async () => {
    isLoading.value = true
    try {
      results.value = await api.searchUsers(query.value)
    } finally {
      isLoading.value = false
    }
  }, 300)

  watch(query, () => search())

  return { query, results, isLoading }
}
```

Rules for composables:
- Prefix with `use`
- Return reactive refs, not raw values
- Handle cleanup in onUnmounted if needed
- Keep composables focused — one concern per composable

## Pinia Stores

```typescript
// stores/useUserStore.ts
export const useUserStore = defineStore('user', () => {
  // State
  const users = ref<User[]>([])
  const currentUser = ref<User | null>(null)

  // Getters (computed)
  const activeUsers = computed(() =>
    users.value.filter(u => u.active)
  )

  // Actions
  async function fetchUsers() {
    users.value = await api.getUsers()
  }

  function clearCurrentUser() {
    currentUser.value = null
  }

  return { users, currentUser, activeUsers, fetchUsers, clearCurrentUser }
})
```

Rules for stores:
- Use setup syntax (function form), not options
- One store per domain concept
- Actions handle API calls — components don't call APIs directly
- Keep stores thin — business logic belongs in composables or services

## Vue Router

```typescript
// Guard pattern
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
})

// Lazy loading routes
const routes = [
  {
    path: '/dashboard',
    component: () => import('./views/Dashboard.vue'),
    meta: { requiresAuth: true },
  },
]
```

## Vue I18n

```vue
<script setup>
const { t } = useI18n()
</script>

<template>
  <h1>{{ t('dashboard.title') }}</h1>
  <p>{{ t('dashboard.welcome', { name: user.name }) }}</p>
</template>
```

Rules:
- Never hardcode user-facing strings — always use `t()`
- Organize keys by feature: `feature.section.label`
- Keep translation files flat within each feature namespace

## Post-Save Navigation

After a successful save (create or edit), use `router.replace()` instead of `router.push()` to navigate away from the form. This replaces the form's history entry so the browser back button skips the form and goes to the previous meaningful page (e.g., the list or detail view).

```typescript
// WRONG — back button reopens the form
await store.update(id, payload)
router.push(`/items/${id}`)

// RIGHT — back button skips past the form
await store.update(id, payload)
router.replace(`/items/${id}`)
```

Apply this to ALL form views (create, edit, log entry). Cancel actions can still use `router.push()` or `router.back()` since no state changed.

## Common Pitfalls

- **Mutating props** — Always emit events, never modify props directly
- **Losing reactivity** — Don't destructure reactive objects without `toRefs()`
- **Memory leaks** — Clean up event listeners, intervals, and subscriptions in `onUnmounted`
- **Over-watching** — Prefer computed over watch when you just need a derived value
- **Giant components** — Extract logic into composables, UI into child components. Keep under 300 lines.
