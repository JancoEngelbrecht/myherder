# MT Phase 5: Session Management & Token Revocation

## Goal
Add token revocation endpoint and UI so farm admins can force-logout users (stolen device response). Super-admin can revoke any user's sessions.

## Prerequisites
- Phases 1-4 complete (DB, scoping, auth, isolation tests)
- Read `server/routes/users.js` for existing user management pattern
- Read `client/src/views/admin/UserManagement.vue` for UI pattern

## Step 5.1 -- Token revocation endpoint

Add to `server/routes/users.js`:

### `POST /api/users/:id/revoke-sessions`

```
Auth: admin or super_admin
Body: (none)

Logic:
1. Find target user by ID within same farm (req.scoped)
2. If not found -> 404
3. Increment token_version: UPDATE users SET token_version = token_version + 1 WHERE id = ?
4. Audit log: logAudit({ entity_type: 'user', entity_id, action: 'revoke_sessions', ... })
5. Return { revoked: true, new_version: N }

Permissions:
- Farm admin: can revoke users in their own farm only
- Super-admin: can revoke any user (needs unscoped query when in farm context)
- Cannot revoke own sessions (or can -- decide based on UX)
```

## Step 5.2 -- Update auth middleware for token_version

This should already be done in Phase 3 (Step 3.2). Verify:
- `server/middleware/auth.js` checks `token_version` on every request
- Bumped version -> old tokens return 401 immediately

## Step 5.3 -- Revoke Sessions UI

Update `client/src/views/admin/UserManagement.vue`:

- Add "Revoke Sessions" button per user row (icon button or text link)
- Use `ConfirmDialog` with message: "This will log out [username] from all devices immediately."
- On confirm: `POST /api/users/${userId}/revoke-sessions`
- Success toast: "[username]'s sessions revoked"
- Error handling for 404 (user not found) and 403 (insufficient permissions)

## Step 5.4 -- i18n keys

Add to both `en.json` and `af.json` under `users` namespace:

- `users.revokeSessions` / `users.revokeSessionsConfirm`
- `users.sessionsRevoked`

## Verification Checklist

1. Revoke endpoint: bump version -> existing JWT returns 401 on next request
2. New login after revoke: issues token with new version, works normally
3. Farm admin can only revoke own farm's users
4. ConfirmDialog shown before revocation
5. `npm test` -- all tests pass (add 3-4 new tests for revoke endpoint)
6. `cd client && npm run test:run` -- all tests pass
7. `npm run lint:fix` -- zero new errors
8. i18n keys in both locales

## Important Notes

- This is a small, focused phase. Should be completable quickly.
- The sessions table described in the original plan is deferred -- token versioning is sufficient for <10 farms.
- Consider: should revoking your OWN sessions be allowed? (Use case: admin realizes their own token is compromised.) Probably yes, but they'll be logged out immediately.
