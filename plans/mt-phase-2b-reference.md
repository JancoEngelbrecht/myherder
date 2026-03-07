# MT Phase 2B: Reference Data Routes

## Goal
Apply tenant scoping to reference/admin route files: medications (9 queries), issueTypes (9), breedTypes (9), users (11), appSettings (1), featureFlags (1), auditLog (1), export (11). Total: ~52 query locations.

## Prerequisites
- Phase 2A complete (tenantScope middleware exists, core CRUD routes scoped)
- Test tokens include `farm_id` (set up in Phase 2A)
- Read each route file before modifying it

## Step 2B.1 -- Update `server/routes/medications.js` (9 queries)

Add `tenantScope` middleware. For each endpoint:

| Endpoint | Query changes |
|----------|--------------|
| `GET /` | `req.scoped('medications')` (respects `?all=1` for admin) |
| `GET /:id` | `req.scoped('medications').where('id', id)` |
| `POST /` | Add `farm_id: req.farmId` to insert |
| `PUT /:id` | Scope SELECT + UPDATE |
| `DELETE /:id` | Scope SELECT. Check for treatment references within same farm. |

Usage check before delete: `db('treatments').where('medication_id', id)` needs farm scoping -- `req.scoped('treatments').where('medication_id', id)`.

## Step 2B.2 -- Update `server/routes/issueTypes.js` (9 queries)

| Endpoint | Query changes |
|----------|--------------|
| `GET /` | `req.scoped('issue_type_definitions')` |
| `GET /:id` | Scope by farm_id |
| `POST /` | Add `farm_id: req.farmId`. Code uniqueness check scoped to farm. |
| `PUT /:id` | Scope SELECT + UPDATE |
| `DELETE /:id` | Scope SELECT. Reference check in `health_issues` scoped to farm. |

Important: `code` uniqueness is now `UNIQUE(farm_id, code)` -- the duplicate check in POST must be `req.scoped('issue_type_definitions').where('code', code)`.

## Step 2B.3 -- Update `server/routes/breedTypes.js` (9 queries)

Same pattern as issueTypes:

| Endpoint | Query changes |
|----------|--------------|
| `GET /` | `req.scoped('breed_types')` |
| `GET /:id` | Scope by farm_id |
| `POST /` | Add `farm_id: req.farmId`. Code uniqueness scoped to farm. |
| `PUT /:id` | Scope SELECT + UPDATE |
| `DELETE /:id` | Scope SELECT. Reference check in `cows` scoped to farm. |

## Step 2B.4 -- Update `server/routes/users.js` (11 queries)

| Endpoint | Query changes |
|----------|--------------|
| `GET /` | `req.scoped('users')` (with `?active_only` filter) |
| `GET /:id` | `req.scoped('users').where('id', id)` |
| `POST /` | Add `farm_id: req.farmId`. Username uniqueness scoped to farm. |
| `PATCH /:id` | Scope SELECT + UPDATE. Target user must be in same farm. |
| `DELETE /:id` | Scope SELECT + UPDATE (soft deactivate). Target must be in same farm. |

Important: PIN uniqueness check (if any) must also be farm-scoped. Two workers in different farms can have the same PIN.

## Step 2B.5 -- Update `server/routes/appSettings.js` (1 direct query, but ~6 operations)

Settings are now keyed by `(farm_id, key)`:

| Endpoint | Query changes |
|----------|--------------|
| `GET /` (public) | This is a special case -- currently no auth required. Needs `farm_code` query param to resolve farm, OR returns nothing without context. See notes below. |
| `PATCH /` | Scope reads and upserts by `farm_id` |

**Special handling for GET /api/settings (public)**:
- Currently returns settings without auth for the login screen (shows farm name)
- With multi-tenancy: accept `?farm_code=BOER` query param, resolve to `farm_id`, return that farm's settings
- If no `farm_code`, return empty or global defaults
- Do NOT add `tenantScope` middleware to GET -- it has no auth

## Step 2B.6 -- Update `server/routes/featureFlags.js` (1 direct query, but multiple operations)

Feature flags are now keyed by `(farm_id, key)`:

| Endpoint | Query changes |
|----------|--------------|
| `GET /` | `req.scoped('feature_flags')` or `db('feature_flags').where('farm_id', req.farmId)` |
| `PATCH /` | Upserts scoped by `farm_id` |

## Step 2B.7 -- Update `server/routes/auditLog.js` (1 direct query, but with filters)

| Endpoint | Query changes |
|----------|--------------|
| `GET /` | `req.scoped('audit_log')` with existing filters (entity_type, user_id, etc.) |

## Step 2B.8 -- Update `server/routes/export.js` (11 queries)

The export endpoint dumps all tables. Every table query needs farm scoping:

```js
// Before: db('cows').select('*')
// After:  req.scoped('cows').select('*')
```

Apply to all ~11 table dumps. The export should only return the requesting farm's data.

## Verification Checklist

1. `grep -rn "db('" server/routes/medications.js server/routes/issueTypes.js server/routes/breedTypes.js server/routes/users.js server/routes/appSettings.js server/routes/featureFlags.js server/routes/auditLog.js server/routes/export.js` -- all bare `db()` calls replaced or explicitly scoped
2. `npm test` -- all backend tests pass
3. `npm run lint:fix` -- zero new errors
4. Verify: code/name uniqueness checks in issueTypes, breedTypes, medications are farm-scoped
5. Verify: user operations cannot cross farm boundaries
6. Verify: export only returns current farm's data
7. Verify: public settings endpoint works with `farm_code` param and without auth

## Important Notes

- `GET /api/settings` is the only public endpoint that needs farm resolution without auth. Use `farm_code` query param.
- `appSettings` and `featureFlags` have composite PKs now -- upsert logic needs updating (was single-key PK, now composite)
- PIN login lookup in `auth.js` is Phase 3 -- don't modify auth routes here
- The `auditService.js` (used by many routes for logging) needs `farm_id` too -- that's Phase 2D (services). For now, audit logging from routes modified here may not include `farm_id` in the audit record. That's OK -- Phase 2D will fix it.
