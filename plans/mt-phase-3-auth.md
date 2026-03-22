# MT Phase 3: Auth Changes (Login, 2FA, Token Versioning)

## Goal

Update authentication to support multi-tenant login (farm code), TOTP 2FA for super-admin, and token versioning for session revocation. Update both backend and frontend.

## Prerequisites

- Phases 1 + 2A-2D complete (all routes farm-scoped)
- Install: `npm install otpauth` (server)
- Install: `cd client && npm install qrcode.vue` or similar QR component (frontend)
- Read `server/routes/auth.js` and `client/src/stores/auth.js` before modifying

## Step 3.1 -- Update login endpoints (`server/routes/auth.js`)

### `POST /api/auth/login` (password login)

```
Request: { username, password, farm_code? }

If farm_code is provided:
  1. Resolve farm: db('farms').where('code', farm_code.toUpperCase()).where('is_active', true)
  2. If farm not found -> 401 "Invalid farm code"
  3. Find user: db('users').where('farm_id', farm.id).where('username', username).where('is_active', true)
  4. Verify password
  5. Issue JWT with farm_id

If farm_code is empty/missing:
  1. Find user: db('users').where('role', 'super_admin').where('username', username).where('is_active', true)
  2. If not found -> 401
  3. Verify password
  4. If totp_enabled = false -> return { requires_totp_setup: true, temp_token }
  5. If totp_enabled = true -> return { requires_2fa: true, temp_token }
  6. temp_token: short-lived JWT (10 min), includes user id + role but NOT farm_id
```

### `POST /api/auth/login-pin` (PIN login)

```
Request: { pin, farm_code }

1. farm_code is REQUIRED (no super-admin PIN login)
2. Resolve farm by code
3. Find worker: db('users').where('farm_id', farm.id).where('pin', hashedPin).where('is_active', true)
4. Issue JWT with farm_id
```

### JWT payload shape (all tokens)

```js
{
  ;(id, // user UUID
    username,
    full_name,
    role, // 'admin' | 'worker' | 'super_admin'
    permissions, // string[]
    language,
    farm_id, // UUID or null (super-admin without farm context)
    token_version) // integer, for revocation
}
```

### `POST /api/auth/refresh`

- Decode existing token
- Verify `token_version` matches DB: `db('users').where('id', decoded.id).select('token_version')`
- If mismatch -> 401 "Token revoked"
- Preserve `farm_id` from existing token
- Issue new JWT with same payload + updated expiry

## Step 3.2 -- Token version check in auth middleware

Update `server/middleware/auth.js`:

After JWT signature verification, add a DB check:

```js
const user = await db('users').where('id', decoded.id).select('token_version', 'is_active').first()
if (!user || !user.is_active || decoded.token_version !== user.token_version) {
  return res.status(401).json({ error: 'Token revoked' })
}
```

This adds one PK lookup per request. Acceptable cost for <10 farms.

**Important**: For the `temp_token` (2FA flow), skip the version check -- temp tokens don't have `token_version`.

## Step 3.3 -- 2FA endpoints (new)

### `POST /api/auth/setup-2fa`

- Auth: `temp_token` only (verify it's a temp token with short expiry)
- Generate TOTP secret using `otpauth` library
- Generate 8 recovery codes (random 8-char alphanumeric strings)
- Store bcrypt-hashed recovery codes in `users.recovery_codes` (JSON array)
- Store TOTP secret in `users.totp_secret` (consider encrypting with app secret)
- Return: `{ qr_uri, secret, recovery_codes }` (plaintext recovery codes shown once)
- Do NOT set `totp_enabled = true` yet -- wait for confirmation

### `POST /api/auth/confirm-2fa`

- Auth: `temp_token`
- Body: `{ code }` (6-digit TOTP code)
- Verify code against stored `totp_secret`
- If valid: set `totp_enabled = true`, issue full JWT
- If invalid: 401

### `POST /api/auth/verify-2fa`

- Auth: `temp_token`
- Body: `{ code }` (6-digit TOTP code OR recovery code)
- Try TOTP verification first
- If TOTP fails, try matching against `recovery_codes` (bcrypt compare each)
- If recovery code matches: remove it from array, update DB
- If valid: issue full JWT
- If invalid: 401

## Step 3.4 -- Frontend auth store changes (`client/src/stores/auth.js`)

### `login()` action

- Accept `farmCode` parameter
- Send `farm_code` in request body
- Handle new response shapes:
  - `{ requires_totp_setup: true, temp_token }` -> store temp token, navigate to `/auth/setup-2fa`
  - `{ requires_2fa: true, temp_token }` -> store temp token, navigate to `/auth/2fa`
  - Normal token response -> proceed as before
- On success: `localStorage.setItem('farm_code', farmCode)`

### `loginPin()` action

- Accept `farmCode` parameter (required)
- Send `farm_code` in request body

### New state

- `tempToken` -- short-lived token for 2FA flow
- `pending2fa` -- boolean, true when awaiting 2FA

### `setSession()` -- extract `farm_id` from decoded JWT (already done by existing decode logic, just verify)

## Step 3.5 -- Login view changes (`client/src/views/LoginView.vue`)

- Add "Farm Code" text input above username
- Uppercase transform on input (`v-model` with `.toUpperCase()` or CSS `text-transform`)
- Pre-fill from `localStorage('farm_code')`
- If farm code is empty: hide PIN tab (super-admin uses password only)
- On blur of farm code field (optional): call `GET /api/settings?farm_code=X` to display farm name as visual confirmation
- Pass `farmCode` to `authStore.login()` and `authStore.loginPin()`

## Step 3.6 -- New 2FA views

### `client/src/views/TwoFactorVerifyView.vue`

- Route: `/auth/2fa`
- 6-digit code input (numeric, auto-advance, or single input field)
- Submit button calls `POST /api/auth/verify-2fa` with temp token
- Link: "Use recovery code instead" -- toggles input to text field
- On success: `authStore.setSession(token)`, navigate to `/`
- On failure: show error, allow retry

### `client/src/views/TwoFactorSetupView.vue`

- Route: `/auth/setup-2fa`
- Step 1: Show QR code (rendered from `qr_uri` using QR component) + secret text for manual entry
- Step 2: "Enter code from your authenticator app" -- 6-digit input
- Submit calls `POST /api/auth/confirm-2fa`
- Step 3: On success, display 8 recovery codes with "Save these codes" warning
- "Continue" button -> `authStore.setSession(token)`, navigate to `/`

### Router updates (`client/src/router/index.js`)

- Add `/auth/2fa` -> TwoFactorVerifyView (no auth required, but needs temp token)
- Add `/auth/setup-2fa` -> TwoFactorSetupView (no auth required, but needs temp token)

## Step 3.7 -- i18n keys

Add to both `en.json` and `af.json`:

### `login` namespace additions

- `login.farmCode` / `login.farmCodePlaceholder`
- `login.invalidFarmCode`

### New `twoFactor` namespace

- `twoFactor.title` / `twoFactor.subtitle`
- `twoFactor.enterCode` / `twoFactor.verify`
- `twoFactor.useRecoveryCode` / `twoFactor.useAuthenticator`
- `twoFactor.setupTitle` / `twoFactor.setupSubtitle`
- `twoFactor.scanQR` / `twoFactor.manualEntry`
- `twoFactor.confirmCode`
- `twoFactor.recoveryCodes` / `twoFactor.saveCodesWarning`
- `twoFactor.continue`
- `twoFactor.invalidCode`

## Verification Checklist

1. **Auth flow matrix** -- test all paths:
   - Farm worker: farm code + PIN -> JWT with `farm_id` ✓
   - Farm admin: farm code + password -> JWT with `farm_id` ✓
   - Super-admin first login: no farm code + password -> 2FA setup flow ✓
   - Super-admin subsequent: no farm code + password -> 2FA verify ✓
   - PIN without farm code -> rejected ✓
   - Invalid farm code -> 401 ✓
   - Deactivated farm -> 401 ✓
2. **Token payload**: `farm_id` and `token_version` in ALL issued JWTs
3. **Token version**: Bump version -> existing JWTs return 401
4. **2FA security**: temp_token cannot access any API endpoint (only 2FA endpoints)
5. **Recovery codes**: Work once, then consumed
6. `npm test` -- all backend tests pass
7. `cd client && npm run test:run` -- all frontend tests pass
8. `npm run lint:fix` -- zero new errors
9. i18n: all new keys in both locales

## Important Notes

- Existing backend tests use JWT tokens without `farm_id` or `token_version`. The auth middleware change (token_version check) will break them unless test tokens are updated. Phase 2A should have already handled this -- verify.
- The temp_token for 2FA should have a distinct `type: 'temp'` claim so the auth middleware can skip token_version checks for it.
- Consider rate-limiting 2FA verification attempts (e.g., 5 attempts per temp_token).
- The `otpauth` library generates standard TOTP URIs compatible with Google Authenticator, Authy, etc.
