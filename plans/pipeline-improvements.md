# Pipeline Improvements — Port from myLand

> Ported from myLand (c:\projects\mycultivar). Reference implementations there.

## Scope

**In scope:**

- Add frontend build on GitHub runner + SCP dist/ to deploy workflow
- Add `clients.claim()` to custom service worker
- Add `controllerchange` auto-reload listener to `main.js`
- Add 60-second SW update polling with tab visibility awareness

**Out of scope:**

- Push notifications (separate feature, myHerder doesn't have this)
- Token expiry check in SW (hardening task, can be ported separately)
- Backend changes (purely CI/CD + client-side PWA)

**Assumptions:**

- `SSH_PRIVATE_KEY` GitHub secret already configured (existing workflow uses it)
- cPanel has same thread-limit issue as myLand (building on runner is safer regardless)

---

## Tasks

### Task 1: Upgrade deploy workflow with frontend build + SCP

- **Complexity:** S
- **Files:** `.github/workflows/deploy.yml`
- **Depends on:** nothing
- **What:** Add checkout, Node setup, `npm ci && npm run build` on runner, SCP `client/dist/` to server, then existing SSH deploy steps. Mirror myLand's workflow adapted for myherder credentials.
- **Verify:** Push to main triggers workflow; `dist/` appears on server without server-side build.

### Task 2: Add `clients.claim()` to custom SW

- **Complexity:** S
- **Files:** `client/public/sw-custom.js`
- **Depends on:** nothing
- **What:** Add `activate` event listener with `event.waitUntil(clients.claim())`. This makes the new SW take control of all open tabs immediately on activation instead of waiting for all tabs to close.
- **Verify:** After deploy, new SW claims existing tabs (visible in DevTools > Application > Service Workers).

### Task 3: Add controllerchange listener + SW update polling to main.js

- **Complexity:** S
- **Files:** `client/src/main.js`
- **Depends on:** Task 2 (claim triggers the controller change)
- **What:** Append the same SW block from myLand's main.js:
  1. `controllerchange` listener with reload guard (prevents infinite loop)
  2. `navigator.serviceWorker.ready` → 60s `registration.update()` polling
  3. Pause polling on `document.hidden`, resume + immediate check on focus
- **Verify:** After deploy, open tab auto-reloads when new SW activates. Tab left in background doesn't poll; foregrounding triggers immediate check.

---

## Architecture

```
Push to main
    │
    ▼
GitHub Actions Runner
    ├── checkout code
    ├── npm ci + npm run build (client/)
    ├── SCP client/dist/ → server
    └── SSH: git pull, npm install, migrate, restart
            │
            ▼
      Server restarts with new code + pre-built dist/
            │
            ▼
      Browser (open tabs)
        ├── SW update polling (60s) detects new SW
        ├── New SW activates → clients.claim()
        ├── controllerchange fires → page reloads
        └── User sees new version seamlessly
```

No new abstractions. No new dependencies. 3 files touched.

---

## Test Matrix

| Codepath / Flow           | Happy path              | Error path                   | Edge case                           |
| ------------------------- | ----------------------- | ---------------------------- | ----------------------------------- |
| Deploy workflow build     | Build succeeds, SCP ok  | Build fails → workflow fails | No client changes (dist same)       |
| `clients.claim()`         | SW claims open tabs     | N/A (browser API)            | Multiple tabs open                  |
| `controllerchange` reload | Tab reloads once        | N/A                          | Guard prevents infinite reload      |
| SW polling (60s)          | Detects new SW          | `update().catch(() => {})`   | Tab hidden → no polling             |
| Visibility change         | Resume polling on focus | N/A                          | Rapid hide/show doesn't double-poll |

These are all browser-level behaviors — no unit tests needed. Verification is manual via DevTools.

---

## Failure Modes

| Codepath                | Failure scenario                       | Covered?                 | Error handling?       | Silent?          |
| ----------------------- | -------------------------------------- | ------------------------ | --------------------- | ---------------- |
| SCP dist/               | SSH key invalid → scp fails            | Yes (workflow fails)     | Yes (non-zero exit)   | No               |
| `clients.claim()`       | Old SW still active (rare browser bug) | N/A                      | Graceful (just waits) | Yes but harmless |
| `controllerchange`      | Infinite reload loop                   | Yes (guard flag)         | Yes                   | No               |
| `registration.update()` | Network error during poll              | Yes (`.catch(() => {})`) | Yes (swallowed)       | Yes but harmless |

No critical gaps.
