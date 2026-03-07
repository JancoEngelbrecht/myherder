---
name: vue-patterns
description: Load when building Vue 3 components. Covers Composition API, Pinia stores, vue-router, vue-i18n, offline-first patterns, and component architecture. Sources — Vue.js official style guide (vuejs.org/style-guide), Vue.js performance guide, Vue.js security guide, Pinia official docs (pinia.vuejs.org).
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

## Pinia Stores (source: pinia.vuejs.org)

```js
// stores/useUserStore.js
export const useUserStore = defineStore('user', () => {
  // State — declare ALL properties upfront (can't add later)
  const users = ref([])
  const currentUser = ref(null)

  // Getters (computed)
  const activeUsers = computed(() =>
    users.value.filter(u => u.active)
  )

  // Actions — use regular functions (not arrow) if you need `this`
  async function fetchUsers() {
    try {
      const { data } = await api.get('/api/users')
      users.value = data
    } catch (err) {
      // Handle error — don't swallow
      throw err
    }
  }

  function clearCurrentUser() {
    currentUser.value = null
  }

  // Must return ALL state, getters, and actions
  return { users, currentUser, activeUsers, fetchUsers, clearCurrentUser }
})
```

### Pinia rules (from official docs):
- **Setup syntax** (function form) — enables watchers, composables, and inject()
- **One store per domain** — `useAuthStore`, `useCowStore`, `useMilkRecordStore`
- **Declare ALL state properties** upfront — can't add new properties after creation
- **Use `storeToRefs()`** when destructuring — plain destructuring breaks reactivity
- **Actions handle API calls** — components don't call APIs directly
- **Return errors from async actions** — let the calling component handle display
- **Access other stores in actions** — import and call directly inside the action

### Pinia anti-patterns (from official docs):
```js
// BAD — destructuring breaks reactivity
const { name, count } = store  // These are static snapshots!

// GOOD — use storeToRefs for reactive destructuring
const { name, count } = storeToRefs(store)
const { increment } = store  // Actions can be destructured directly

// BAD — replacing entire state object
store.$state = { count: 24 }  // Breaks reactivity

// GOOD — use $patch for multiple mutations
store.$patch({ count: 24, name: 'Eduardo' })

// GOOD — use $patch with function for complex mutations
store.$patch((state) => {
  state.items.push({ name: 'shoes' })
  state.hasChanged = true
})
```

### Function-returning getters lose caching:
```js
// This getter is NOT cached — recalculates every access
getUserById: (state) => {
  return (userId) => state.users.find(u => u.id === userId)
}
// Use only when you must pass arguments. For simple derived values, use computed.
```

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

## Offline-First Store Pattern

Stores that support offline mode follow a consistent pattern: try API first, fall back to IndexedDB.

```js
import api from '../services/api'
import db from '../db/indexedDB'
import { enqueue, isOfflineError } from '../services/syncManager'

export const useItemStore = defineStore('items', () => {
  const items = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  async function fetchItems() {
    isLoading.value = true
    error.value = null
    try {
      const { data } = await api.get('/api/items')
      items.value = data
      // Cache to IndexedDB for offline access
      await db.items.bulkPut(data)
    } catch (err) {
      if (isOfflineError(err)) {
        // Offline — load from IndexedDB
        items.value = await db.items.toArray()
      } else {
        error.value = err.message
      }
    } finally {
      isLoading.value = false
    }
  }

  async function createItem(payload) {
    try {
      const { data } = await api.post('/api/items', payload)
      items.value.push(data)
      await db.items.put(data)
      return data
    } catch (err) {
      if (isOfflineError(err)) {
        // Queue for sync and save locally
        const localItem = { ...payload, id: crypto.randomUUID(), _pending: true }
        await db.items.put(localItem)
        items.value.push(localItem)
        await enqueue('POST', '/api/items', payload, 'items', localItem.id)
        return localItem
      }
      throw err
    }
  }

  return { items, isLoading, error, fetchItems, createItem }
})
```

### Key offline patterns:
- **Always cache API responses** to IndexedDB after successful fetch
- **Always check `isOfflineError(err)`** in catch blocks to decide fallback
- **Use `enqueue()`** from syncManager to queue mutations for later sync
- **Generate local UUIDs** for offline-created entities
- **Mark offline-created items** so UI can show pending indicators

## Component Architecture (Atomic Design)

Organize components by complexity:

```
components/
  atoms/         # Single-purpose UI elements (SyncIndicator, Badge)
  molecules/     # Composed atoms with some logic (TeatSelector, ConfirmDialog)
  organisms/     # Complex UI sections (AppHeader, BottomNav, CowCard)
views/           # Page-level components (route targets)
```

### Rules:
- **Atoms**: No API calls, no store access. Props in, events out.
- **Molecules**: May use stores for read-only data. No direct API calls.
- **Organisms**: Can use stores and composables. May trigger actions.
- **Views**: Orchestrate organisms. Handle route params, page-level loading/error states.
- **Every delete action** must use `ConfirmDialog` — never delete without confirmation.

## Feature Flag Guards

Check feature flags before rendering modules or navigating to guarded routes:

```js
// In router — meta-based guard
{
  path: '/breeding',
  component: () => import('./views/BreedingList.vue'),
  meta: { requiresAuth: true, requiresModule: 'breeding' }
}

// In beforeEach guard
if (to.meta.requiresModule) {
  const flags = useFeatureFlagsStore()
  if (!flags.flags[to.meta.requiresModule]) {
    return { name: 'dashboard' }
  }
}

// In components — conditional rendering
<template>
  <div v-if="featureFlags.flags.breeding">
    <!-- breeding UI -->
  </div>
</template>
```

## Permission-Based UI

Hide or disable UI elements based on user permissions:

```js
const authStore = useAuthStore()

// Check permission
const canManageCows = computed(() => authStore.hasPermission('can_manage_cows'))

// In template
<button v-if="canManageCows" @click="editCow">Edit</button>
```

Admin role bypasses all permission checks.

## Vue Style Guide Rules (source: vuejs.org/style-guide)

### Essential (Priority A — must follow):
1. **Multi-word component names** — `TodoItem` not `Item`. Prevents HTML element conflicts.
2. **Detailed prop definitions** — always specify type, add required/validator for important props
3. **Keyed `v-for`** — always use `:key` with a unique ID (not array index)
4. **Never combine `v-if` with `v-for`** on the same element — use computed to filter, or wrap in `<template v-for>`
5. **Component-scoped styles** — always use `<style scoped>` or CSS modules

### Strongly Recommended (Priority B):
- **One component per file** — no multi-component files
- **PascalCase filenames** — `CowCard.vue`, not `cow-card.vue`
- **PascalCase in templates** — `<CowCard />` in SFCs
- **Self-closing components** — `<CowCard />` not `<CowCard></CowCard>` (when no slot content)
- **Full-word names** — `StudentDashboardSettings` not `SdSettings`
- **Multi-attribute elements span multiple lines** — one attribute per line
- **Simple expressions in templates** — complex logic goes in computed properties
- **Use directive shorthands consistently** — `:` for `v-bind`, `@` for `v-on`, `#` for `v-slot`

## Performance (source: vuejs.org/guide/best-practices/performance)

### Page load:
- **Lazy-load routes** — `component: () => import('./views/View.vue')`
- **Use `defineAsyncComponent`** for heavy components not needed on initial render
- **Tree-shake imports** — `import { debounce } from 'lodash-es'` not `import _ from 'lodash'`

### Update performance:
- **Keep props stable** — pass computed booleans instead of IDs that force all children to re-render
```vue
<!-- BAD — all items re-render when activeId changes -->
<ListItem v-for="item in list" :active-id="activeId" />

<!-- GOOD — only the affected item re-renders -->
<ListItem v-for="item in list" :active="item.id === activeId" />
```
- **Use `v-once`** for static content that never updates
- **Use `v-memo`** to skip re-rendering expensive sub-trees: `v-memo="[item.id, isSelected]"`
- **Use `shallowRef`** for large immutable data (must replace root, not mutate nested)
- **Virtualize large lists** — don't render 1000+ items. Use vue-virtual-scroller.

### Computed stability (Vue 3.4+):
Computed properties only trigger effects when their value actually changes. But objects created fresh each compute are always "different":
```js
// BAD — triggers every time even if isEven hasn't changed
const obj = computed(() => ({ isEven: count.value % 2 === 0 }))

// GOOD — returns old object if value unchanged
const obj = computed((oldValue) => {
  const newValue = { isEven: count.value % 2 === 0 }
  if (oldValue && oldValue.isEven === newValue.isEven) return oldValue
  return newValue
})
```

## Security (source: vuejs.org/guide/best-practices/security)

- **`{{ }}` and `:attr` are auto-escaped** — safe for user content
- **Never use `v-html` with user input** — bypasses escaping, enables XSS
- **Never use user input as component templates** — equivalent to arbitrary JS execution
- **Sanitize URLs on the backend** — `javascript:` URLs bypass frontend checks
- **Whitelist style properties** — don't bind full `:style` objects from user data (clickjacking risk)
- **Never bind user content to event handlers** — `@click="userCode"` executes arbitrary JS

## Common Pitfalls

- **Mutating props** — Always emit events, never modify props directly
- **Losing reactivity** — Don't destructure reactive objects without `toRefs()` (or `storeToRefs()` for Pinia)
- **Memory leaks** — Clean up event listeners, intervals, and subscriptions in `onUnmounted`
- **Over-watching** — Prefer computed over watch when you just need a derived value
- **Giant components** — Extract logic into composables, UI into child components. Keep under 300 lines.
- **Mixing Options API into `<script setup>`** — Never use `data()`, `methods:`, `computed:` in `<script setup>`. Use `ref()`, `computed()`, and plain functions.
- **Using `Number(route.params.id)`** — Route params are strings. UUIDs are not numbers. Use the param directly.
- **Forgetting i18n keys** — Every user-facing string must use `t()`. Add keys to BOTH `en.json` and `af.json`.
- **`v-if` with `v-for` on same element** — `v-if` evaluates first, iteration variable doesn't exist yet. Use computed filter or `<template v-for>`.
- **Destructuring Pinia stores** — breaks reactivity. Use `storeToRefs(store)` for state/getters, plain destructure for actions only.
