# Implementation Prompt — Step 2 (Bootstrap `ADMIN` Tenant & Modules)

## Objective

Extend the bootstrap script so the **ADMIN** tenant (NapSoft) is provisioned with the **exact modules it needs**, seeded super_admin users, and idempotent re-runs. Use ESM, pg‑schemata, and our module-scoped migration pattern.

> **Update (pg-schemata migrator)**  
> The `src/db/migrations` registry now coordinates module-scoped migrations and records history in `pgschemata.migrations`. Use `npm run migrate:dev -w apps/nap-serv` to invoke the new runner when testing bootstrap flows.

## Preconditions (from Step 1)

- Auth/admin routers & middlewares live under `modules/core`.
- Tenants are normal schemas with **module-scoped migrations**. Only enabled modules create tables in that schema.
- super_admin impersonation is handled by core admin controller (assume/exit).

## Deliverables

1. A **bootstrapsuper_admin** script that:
   - Ensures tenant **ADMIN** exists with `schema_name='admin'`, `tenant_code='ADMIN'`.
   - Enables only: `core`, `gl`, `ap`, `ar`.
   - Runs module migrations for `admin` schema accordingly.
   - Seeds at least one **super_admin** user + role assignment in `admin` schema.
   - Is **idempotent** (safe to re-run).

2. A **module registry** write (per tenant) that records enabled modules and version info.

3. Unit tests covering idempotency and invariants.

---

## Data Structures

### `platform.tenants` (or `admin.tenants`) minimal columns

```sql
id uuid primary key,
tenant_code text unique not null,     -- 'ADMIN'
schema_name text unique not null,     -- 'admin'
name text not null,                   -- 'NapSoft'
status text not null default 'active',-- active|archived
created_at timestamptz default now()
```

### `platform.enabled_modules` (tenant-scoped registry)

```sql
id uuid primary key,
tenant_code text not null,            -- FK by code (no cross-schema FK)
module text not null,                 -- 'core'|'gl'|'ap'|'ar'|...
version text not null,                -- semantic version of module migration set
enabled_at timestamptz default now(),
unique (tenant_code, module)
```

> If you prefer keeping registry inside `admin` schema, mirror this shape as `admin.module_registry`. Either is fine; pick one and keep it consistent.

---

## Script Location & Invocation

```
apps/nap-serv/scripts/bootstrapsuper_admin.mjs
# run via: node apps/nap-serv/scripts/bootstrapsuper_admin.mjs
```

---

## Script Behavior (pseudocode, ESM)

```js
// apps/nap-serv/scripts/bootstrapsuper_admin.mjs
import 'dotenv/config';
import { createPool } from '../src/db/pool.js'; // your pg client wrapper
import {
  ensureTenant,
  enableModules,
  runMigrationsFor,
} from './lib/bootstrapLib.js';
import { seedsuper_admin } from './lib/seedAdmin.js';

const ADMIN = {
  tenant_code: 'ADMIN',
  schema_name: 'admin',
  name: 'NapSoft',
  modules: ['core', 'gl', 'ap', 'ar'],
};

async function main() {
  const db = await createPool();

  // 1) Ensure tenant row + schema exist
  await ensureTenant(db, ADMIN);

  // 2) Enable required modules (upsert into module registry)
  await enableModules(db, ADMIN.tenant_code, ADMIN.modules);

  // 3) Run schema migrations ONLY for enabled modules (idempotent)
  for (const module of ADMIN.modules) {
    await runMigrationsFor(db, ADMIN.schema_name, module);
  }

  // 4) Seed at least one super_admin user in ADMIN schema
  await seedsuper_admin(db, {
    schema: ADMIN.schema_name,
    email: process.env.super_admin_EMAIL,
    password: process.env.super_admin_PASSWORD,
    first_name: 'System',
    last_name: 'Admin',
  });

  console.log('Bootstrap complete for ADMIN.');
  await db.end();
}

main().catch((err) => {
  console.error('bootstrapsuper_admin failed:', err);
  process.exit(1);
});
```

---

## Bootstrap Library (explicit, idempotent helpers)

```js
// apps/nap-serv/scripts/lib/bootstrapLib.js
import { sql } from '../../src/db/sql.js'; // lightweight tagged template wrapper

export async function ensureTenant(db, { tenant_code, schema_name, name }) {
  await db.query(sql`BEGIN`);
  try {
    // 1) upsert tenant row (in platform.tenants or admin.tenants)
    await db.query(sql`
      INSERT INTO platform.tenants (id, tenant_code, schema_name, name)
      VALUES (gen_random_uuid(), ${tenant_code}, ${schema_name}, ${name})
      ON CONFLICT (tenant_code) DO UPDATE SET schema_name = EXCLUDED.schema_name, name = EXCLUDED.name
    `);

    // 2) create schema if missing
    await db.query(sql`CREATE SCHEMA IF NOT EXISTS "${schema_name}"`);

    await db.query(sql`COMMIT`);
  } catch (e) {
    await db.query(sql`ROLLBACK`);
    throw e;
  }
}

export async function enableModules(db, tenant_code, modules) {
  for (const m of modules) {
    await db.query(sql`
      INSERT INTO platform.enabled_modules (id, tenant_code, module, version)
      VALUES (gen_random_uuid(), ${tenant_code}, ${m}, '1.0.0')
      ON CONFLICT (tenant_code, module) DO UPDATE SET version = EXCLUDED.version
    `);
  }
}

export async function runMigrationsFor(db, schema_name, module) {
  // delegate to your migration runner with a per-module path
  // e.g., apps/nap-serv/modules/<module>/schema/migrations
  return runModuleMigrations({
    db,
    schema: schema_name,
    module,
  });
}
```

---

## Seeding a super_admin in `admin` schema

**Rules**

- Insert into `admin.nap_users` + `admin.employees` in **one TX**.
- Assign role `super_admin` in `admin.role_assignments` (or equivalent).
- **Idempotent**: if email exists, update password only if env says `ALLOW_super_admin_RESET=true`.

```js
// apps/nap-serv/scripts/lib/seedAdmin.js
import { hashPassword } from '../../modules/core/utils/crypto.js';
import { sql } from '../../src/db/sql.js';

export async function seedsuper_admin(
  db,
  { schema, email, password, first_name, last_name },
) {
  if (!email || !password)
    throw new Error('super_admin_EMAIL/PASSWORD required');

  await db.query(sql`BEGIN`);
  try {
    const pwHash = await hashPassword(password);

    // upsert nap_user
    await db.query(sql`
      INSERT INTO "${schema}".nap_users (id, email, password_hash, status)
      VALUES (gen_random_uuid(), ${email}, ${pwHash}, 'active')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `);

    // ensure employee exists and links to user
    await db.query(sql`
      INSERT INTO "${schema}".employees (id, user_email, first_name, last_name, active)
      VALUES (gen_random_uuid(), ${email}, ${first_name}, ${last_name}, true)
      ON CONFLICT (user_email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, active = true
    `);

    // upsert role assignment
    await db.query(sql`
      INSERT INTO "${schema}".role_assignments (id, user_email, role)
      VALUES (gen_random_uuid(), ${email}, 'super_admin')
      ON CONFLICT (user_email, role) DO NOTHING
    `);

    // guard: ensure at least one super_admin remains
    const res = await db.query(
      sql`SELECT count(*)::int AS n FROM "${schema}".role_assignments WHERE role='super_admin' AND user_email IN (SELECT email FROM "${schema}".nap_users WHERE status='active')`,
    );
    if (!res.rows[0] || res.rows[0].n < 1)
      throw new Error('Invariant: at least one active super_admin required');

    await db.query(sql`COMMIT`);
  } catch (e) {
    await db.query(sql`ROLLBACK`);
    throw e;
  }
}
```

---

## Environment Variables

```
super_admin_EMAIL=owner@napsoft.io
super_admin_PASSWORD=change_me_now
ALLOW_super_admin_RESET=false
```

---

## Acceptance Tests (Vitest)

- **Idempotency**: running the script twice yields no additional rows; role assignment is not duplicated.
- **Modules enabled**: `platform.enabled_modules` contains exactly `core, gl, ap, ar` for `ADMIN`.
- **Migrations**: tables for disabled modules are **absent** in `admin` schema; enabled module tables exist.
- **super_admin seeded**: `admin.nap_users` & `admin.employees` contain the email; role assignment present.
- **Invariant**: cannot end with zero active super_admins (guard works).

---

## Operational Notes

- Put bootstrap under CI “setup” job for fresh environments, and callable manually.
- On rotation: change `super_admin_PASSWORD` → re-run script with `ALLOW_super_admin_RESET=true`.
- Never permit archiving the `ADMIN` tenant via admin UI/API (guard-rail in Step 3).

---

## Out of Scope (handled in Step 3)

- Read-only admin endpoints for tenants & nap_users.
- Rate limiting and audit logs wiring (already designed).
- Impersonation flow (already implemented in Step 1).
