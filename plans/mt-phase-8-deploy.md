# MT Phase 8: Production Migration & Deployment

## Goal
Define the zero-downtime migration strategy, rollback plan, super-admin provisioning, and post-deploy verification for the cPanel MySQL production environment.

## Prerequisites
- Phases 1-7 complete and tested locally
- Access to cPanel hosting with MySQL
- Current production database backed up

## Step 8.1 -- Pre-deployment preparation

### Backup
1. Full MySQL dump: `mysqldump -u user -p myherder > backup_pre_mt_$(date +%Y%m%d).sql`
2. Store backup in a safe location outside the deployment directory
3. Verify backup can be restored to a test database

### Environment variables
Add to `.env` (or cPanel environment config):
- `JWT_SECRET` -- must be >= 32 characters (enforced since Phase 13)
- Existing DB vars remain unchanged

### Super-admin credentials
Prepare super-admin credentials (will be created via CLI or seed script):
- Username: chosen by you
- Password: strong password
- TOTP will be set up on first login

## Step 8.2 -- Migration execution

### Strategy: single deployment, no rolling update needed

Since this is cPanel (single server), the deployment is:

1. **Deploy new code** (git pull or upload)
2. **Run migrations**: `npm run migrate`
   - Migration 030 runs: creates `farms` table, adds `farm_id` to all tables, backfills existing data as "DEFAULT" farm, adds indexes
   - This is the longest step -- may take a few minutes depending on data volume
3. **Create super-admin user** via CLI script:
   ```bash
   node scripts/create-super-admin.js --username <you> --password <pass>
   ```
4. **Restart the app** (PM2 restart or cPanel Node.js restart)

### Create `scripts/create-super-admin.js`

```js
const db = require('../server/config/database');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

async function createSuperAdmin(username, password) {
  const existing = await db('users').where('role', 'super_admin').first();
  if (existing) {
    console.log('Super admin already exists:', existing.username);
    process.exit(0);
  }

  const id = uuid();
  await db('users').insert({
    id,
    username,
    full_name: 'Super Admin',
    role: 'super_admin',
    password_hash: await bcrypt.hash(password, 10),
    permissions: JSON.stringify([]),
    is_active: true,
    farm_id: null,  // super-admin has no farm
    token_version: 0
  });

  console.log('Super admin created:', username);
  console.log('Log in without a farm code to set up 2FA.');
  await db.destroy();
}

// Parse args
const args = process.argv.slice(2);
const username = args[args.indexOf('--username') + 1];
const password = args[args.indexOf('--password') + 1];

if (!username || !password) {
  console.error('Usage: node create-super-admin.js --username <user> --password <pass>');
  process.exit(1);
}

createSuperAdmin(username, password);
```

## Step 8.3 -- Session transition

Existing user sessions (JWTs) will NOT have `farm_id` or `token_version` claims. These old tokens will fail the new auth middleware.

Options:
1. **Natural expiry**: Admin tokens expire in 24h, worker tokens in 7d. Users re-login naturally.
2. **Force logout**: Acceptable for <10 farms. Users simply need to log in again.
3. **Backward compat**: Accept tokens without `farm_id` and treat them as default farm. **Not recommended** -- cleaner to force re-login.

**Recommended**: Option 2. The auth middleware rejects tokens without `token_version`, forcing re-login. Inform existing users they'll need to log in again.

Existing users log in with farm code `DEFAULT` (or whatever you set for the migrated farm).

## Step 8.4 -- Post-deploy verification checklist

Run these checks on the production database:

```sql
-- 1. Default farm exists
SELECT * FROM farms;

-- 2. No null farm_id in any table
SELECT 'users' AS tbl, COUNT(*) AS nulls FROM users WHERE farm_id IS NULL
UNION ALL SELECT 'cows', COUNT(*) FROM cows WHERE farm_id IS NULL
UNION ALL SELECT 'milk_records', COUNT(*) FROM milk_records WHERE farm_id IS NULL
UNION ALL SELECT 'health_issues', COUNT(*) FROM health_issues WHERE farm_id IS NULL
UNION ALL SELECT 'treatments', COUNT(*) FROM treatments WHERE farm_id IS NULL
UNION ALL SELECT 'breeding_events', COUNT(*) FROM breeding_events WHERE farm_id IS NULL;
-- All should return 0

-- 3. Super-admin exists
SELECT id, username, role FROM users WHERE role = 'super_admin';

-- 4. Indexes exist
SHOW INDEX FROM cows WHERE Key_name LIKE '%farm%';
SHOW INDEX FROM milk_records WHERE Key_name LIKE '%farm%';
```

### Functional checks:
- [ ] Existing admin can log in with farm code `DEFAULT`
- [ ] Super-admin can log in without farm code, completes 2FA setup
- [ ] Super-admin can see farm list, enter a farm, exit
- [ ] All existing cows, milk records, breeding events visible under default farm
- [ ] New milk record can be created
- [ ] Offline sync works (push/pull)
- [ ] PWA installs and works offline
- [ ] Reports generate correctly
- [ ] Analytics show correct data

## Step 8.5 -- Rollback plan

If something goes wrong:

1. **Stop the application**
2. **Restore database**: `mysql -u user -p myherder < backup_pre_mt.sql`
3. **Revert code**: `git checkout <previous-commit>`
4. **Restart the application**

Migration 030 `down()` should also work: `npm run migrate:rollback` -- but the full SQL restore is safer.

## Step 8.6 -- Post-deploy cleanup

After confirming everything works:
- Change the default farm code from `DEFAULT` to something meaningful (e.g., your farm's actual name)
- Update the farm name in settings
- Consider renaming the default farm slug
- Remove or gitignore the `scripts/create-super-admin.js` after use (or keep for future deployments)

## Step 8.7 -- Creating additional farms

Once deployed, creating a new farm is done through the super-admin panel:
1. Login as super-admin (no farm code)
2. Complete 2FA
3. Navigate to Farms -> Create Farm
4. Enter: farm name, farm code, admin username, admin password
5. Share the farm code + admin credentials with the new farm owner
6. They log in, set up their workers, and start using the app

## cPanel-Specific Notes

- **Node.js app**: cPanel's Node.js manager typically runs apps with PM2. After code deploy, use "Restart" button.
- **MySQL**: cPanel provides phpMyAdmin for DB management. Use it for the post-deploy SQL checks.
- **File upload**: Use cPanel's File Manager or SSH (if available) to deploy code. Git deploy hooks are also an option if configured.
- **Environment vars**: Set via cPanel's Node.js app configuration or `.env` file in the app root.
- **SSL**: Ensure the domain has SSL configured (cPanel's AutoSSL or Let's Encrypt) -- required for TOTP QR codes to work in some authenticator apps.

## Important Notes

- The migration is the riskiest step. Always have a backup ready.
- Test the full migration on a copy of the production database BEFORE deploying. Export prod, import locally, run migration, verify.
- The super-admin has `farm_id: null` -- this is intentional. They're not part of any farm until they "enter" one.
- After deployment, monitor error logs for any "Missing farm context" errors -- these indicate a route that wasn't properly scoped.
