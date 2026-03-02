# Phase 10: Profile Page & Logout

## Goal
Add a user profile page with logout functionality, accessible via an avatar circle (user initials) in the AppHeader.

---

## Step 1: Avatar circle in AppHeader

**File:** `client/src/components/organisms/AppHeader.vue`

- Import `useAuthStore` and `RouterLink`
- Add `showAvatar` boolean prop (default `false`)
- Compute initials from `authStore.user?.full_name` (first letter of each word, max 2) — fallback to first 2 chars of `username`
- Render a `<RouterLink to="/profile">` with initials inside a styled circle, placed after the gear icon
- Style: 28px circle, `var(--primary)` bg, white text, 0.625rem bold, centered

**Verify:** `cd client && npm run test:run` — existing AppHeader tests still pass (8 tests in BottomNav.test.js, 7 in AppHeader.test.js)

## Step 2: ProfileView + i18n keys

**New file:** `client/src/views/ProfileView.vue`

- AppHeader with `show-back`, `back-to="/"`
- Large initials avatar (64px circle, same color scheme as header avatar)
- Display: full name, username, role badge (Admin / Worker)
- Menu items as tappable rows:
  - Settings → `/settings` (admin only, guarded by `authStore.isAdmin`)
  - Log Out → calls `authStore.logout()` then `router.push('/login')`
- ConfirmDialog before logout (reuse `molecules/ConfirmDialog.vue`)
- Follow existing view patterns (`.page`, `.page-content`)

**i18n keys** (`client/src/i18n/en.json` + `af.json`):

New `profile` namespace:
```json
// en.json
"profile": {
  "title": "Profile",
  "logout": "Log Out",
  "logoutConfirm": "Are you sure you want to log out?",
  "settings": "Settings",
  "roleAdmin": "Admin",
  "roleWorker": "Worker"
}
```
```json
// af.json
"profile": {
  "title": "Profiel",
  "logout": "Teken Uit",
  "logoutConfirm": "Is jy seker jy wil uitteken?",
  "settings": "Instellings",
  "roleAdmin": "Admin",
  "roleWorker": "Werker"
}
```

## Step 3: Route registration + wire avatar

**File:** `client/src/router/index.js`
- Add route: `{ path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true } }`

**File:** `client/src/views/DashboardView.vue`
- Add `show-avatar` prop to the `<AppHeader>` component

Other views that use AppHeader with default right slot will NOT show the avatar — it's dashboard-only (home screen). Users can always navigate home via bottom nav to reach their profile.

**Verify:** `cd client && npm run test:run` — all existing tests pass

## Step 4: Write tests

**New file:** `client/src/tests/ProfileView.test.js`

Test cases:
1. Renders user full name and username
2. Shows "Admin" role badge for admin users
3. Shows "Worker" role badge for worker users
4. Shows settings link for admin users
5. Hides settings link for worker users
6. Opens confirm dialog when logout tapped
7. Calls `authStore.logout()` and navigates to `/login` on confirm
8. Cancels logout when dialog dismissed

**File:** `client/src/tests/AppHeader.test.js`
- Add test: renders avatar initials when `showAvatar` is true
- Add test: hides avatar when `showAvatar` is false (default)

**Verify:** `cd client && npm run test:run` — all tests pass (existing + new)

## Step 5: Refactor & dead code audit

- Review AppHeader for any unused props, imports, or styles after changes
- Check if any existing logout-related code exists elsewhere that can be removed (e.g., in SettingsView or elsewhere)
- Run `npm run knip` to catch any dead exports
- Ensure no duplicate initials computation logic — extract to a shared util if it appears in both AppHeader and ProfileView
- Verify no unused i18n keys were introduced

**Verify:** `npm run knip` clean, `cd client && npm run test:run` all green, `npm run lint` no new warnings

---

## Files Modified
| File | Change |
|------|--------|
| `client/src/components/organisms/AppHeader.vue` | Add avatar circle + `showAvatar` prop |
| `client/src/views/DashboardView.vue` | Pass `show-avatar` to AppHeader |
| `client/src/router/index.js` | Add `/profile` route |
| `client/src/i18n/en.json` | Add `profile.*` keys |
| `client/src/i18n/af.json` | Add `profile.*` keys |
| `client/src/tests/AppHeader.test.js` | Add avatar tests |

## New Files
| File | Purpose |
|------|---------|
| `client/src/views/ProfileView.vue` | Profile page with user info + logout |
| `client/src/tests/ProfileView.test.js` | ~8 tests covering profile rendering + logout flow |
