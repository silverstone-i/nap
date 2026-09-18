# M0001-00-01: Admin Schema Objects

This chapter belongs to [M0001-00: Admin Database Foundation](M0001-00-admin-database-foundation.md)
and inherits its Draft status. It defines the `pg-schemata` 3.1.2 objects used
by the admin-tenancy models and frozen migration.

## Shared Rules

- UUID primary keys use `gen_random_uuid()` and cannot change.
- Audit-enabled tables add `created_at`, `updated_at`, `created_by`, and `updated_by`.
- Audit actor fields are nullable because setup and background work may not have a portal user.
- `softDelete: true` adds `deactivated_at`; ordinary reads exclude archived rows.
- Soft-deleted rows are never purged automatically.
- Foreign keys use `ON DELETE RESTRICT`.
- Admin tables do not use row-level security.
- Models export the named schema object and extend `pg-schemata.TableModel`.
- `repositories.js` registers each model under its table name.

The migration contains frozen copies of these objects. It does not import the
runtime model definitions and does not insert data.

## `admin.cells`

Stores the registered cell database and whether it may receive traffic.

```js
export const cellsSchema = {
  dbSchema: 'admin',
  table: 'cells',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'environment', type: 'text', notNull: true, immutable: true },
    {
      name: 'database_name',
      type: 'varchar(63)',
      notNull: true,
      immutable: true,
    },
    { name: 'enabled', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["environment IN ('dev', 'test', 'prod')"],
    indexes: [
      {
        columns: ['environment', 'database_name'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
  },
};
```

## `admin.tenants`

Stores tenant registration, lifecycle, cell assignment, and readiness. The
immutable `is_napsoft` flag identifies the protected Napsoft tenant without
depending on a mutable name or code.

```js
export const tenantsSchema = {
  dbSchema: 'admin',
  table: 'tenants',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'tenant_code',
      type: 'varchar(32)',
      notNull: true,
      immutable: true,
    },
    { name: 'name', type: 'varchar(160)', notNull: true },
    { name: 'tier', type: 'text', notNull: true, default: 'starter' },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    {
      name: 'is_napsoft',
      type: 'boolean',
      notNull: true,
      default: false,
      immutable: true,
    },
    { name: 'cell_id', type: 'uuid' },
    { name: 'provisioned', type: 'boolean', notNull: true, default: false },
    { name: 'rbac_ready', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "tier IN ('starter', 'growth', 'enterprise')",
      "status IN ('pending', 'active', 'suspended')",
      'revision > 0',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['cell_id'],
        references: { schema: 'admin', table: 'cells', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        name: 'tenants_active_code',
        columns: [{ expression: 'lower(tenant_code)' }],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['is_napsoft'], unique: true, where: 'is_napsoft = true' },
      { columns: ['cell_id'] },
    ],
  },
};
```

## `admin.portal_users`

Stores central accounts. Ordinary reads exclude `password_hash`; only the
authentication model method selects it.

```js
export const portalUsersSchema = {
  dbSchema: 'admin',
  table: 'portal_users',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'email', type: 'varchar(254)', notNull: true },
    { name: 'password_hash', type: 'text', notNull: true },
    {
      name: 'must_change_password',
      type: 'boolean',
      notNull: true,
      default: true,
    },
    { name: 'status', type: 'text', notNull: true, default: 'active' },
    {
      name: 'is_root',
      type: 'boolean',
      notNull: true,
      default: false,
      immutable: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["status IN ('active', 'locked', 'disabled')"],
    indexes: [
      {
        name: 'portal_users_active_email',
        columns: [{ expression: 'lower(email)' }],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['is_root'], unique: true, where: 'is_root = true' },
    ],
  },
};
```

## `admin.portal_user_tenants`

Stores central tenant membership and the cell-side record created for that
membership. `entity_id` is a value returned by a cell workflow, not a foreign key.

```js
export const portalUserTenantsSchema = {
  dbSchema: 'admin',
  table: 'portal_user_tenants',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'portal_user_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'member_type', type: 'text' },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    { name: 'entity_id', type: 'uuid' },
    { name: 'ready', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "member_type IS NULL OR member_type IN ('employee', 'client', 'vendor', 'vendor_contact')",
      "status IN ('pending', 'active', 'suspended')",
      'revision > 0',
      "(member_type IS NULL AND status = 'active' AND ready = true AND entity_id IS NULL) OR (member_type IS NOT NULL AND (ready = false OR (status = 'active' AND entity_id IS NOT NULL)))",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['portal_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['portal_user_id', 'tenant_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['tenant_id', 'status'] },
    ],
  },
};
```

## `admin.sessions`

Stores hashed session credentials, expiry, selected tenant, and attributed
support access. A null selected tenant represents a platform session.

```js
export const sessionsSchema = {
  dbSchema: 'admin',
  table: 'sessions',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'portal_user_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'token_hash', type: 'text', notNull: true },
    { name: 'tenant_id', type: 'uuid' },
    { name: 'access_mode', type: 'text', notNull: true, default: 'normal' },
    { name: 'effective_user_id', type: 'uuid' },
    { name: 'access_reason', type: 'varchar(512)' },
    { name: 'access_expires_at', type: 'timestamptz' },
    {
      name: 'last_seen_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
    },
    { name: 'idle_expires_at', type: 'timestamptz', notNull: true },
    { name: 'absolute_expires_at', type: 'timestamptz', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['token_hash']],
    checks: [
      "access_mode IN ('normal', 'support')",
      "(access_mode = 'normal' AND effective_user_id IS NULL AND access_reason IS NULL AND access_expires_at IS NULL) OR (access_mode = 'support' AND tenant_id IS NOT NULL AND access_reason IS NOT NULL AND access_expires_at IS NOT NULL)",
      'idle_expires_at <= absolute_expires_at',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['portal_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['effective_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { columns: ['portal_user_id'] },
      { columns: ['tenant_id'] },
      { columns: ['absolute_expires_at'] },
    ],
  },
};
```

## `admin.login_throttles`

Stores keyed login-failure windows. Keys are HMAC values, not emails or IP
addresses. Expired rows may be deleted because this table does not use soft deletion.

```js
export const loginThrottlesSchema = {
  dbSchema: 'admin',
  table: 'login_throttles',
  columns: [
    { name: 'key_hash', type: 'text', notNull: true, immutable: true },
    { name: 'failures', type: 'integer', notNull: true, default: 0 },
    { name: 'window_started_at', type: 'timestamptz', notNull: true },
    { name: 'last_failed_at', type: 'timestamptz', notNull: true },
    { name: 'locked_until', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['key_hash'],
    checks: ['failures >= 0'],
    indexes: [{ columns: ['locked_until'] }, { columns: ['last_failed_at'] }],
  },
};
```

## `admin.system_roles`

Stores the immutable system-role catalogue. Unit 5 inserts the three definitions.

```js
export const systemRolesSchema = {
  dbSchema: 'admin',
  table: 'system_roles',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    { name: 'name', type: 'text', notNull: true, immutable: true },
    { name: 'capabilities', type: 'text[]', notNull: true },
  ],
  constraints: {
    primaryKey: ['name'],
    checks: ["name IN ('platform_admin', 'support', 'tenant_admin')"],
  },
};
```

## `admin.platform_roles`

Stores active and archived assignments of `platform_admin` or `support`.

```js
export const platformRolesSchema = {
  dbSchema: 'admin',
  table: 'platform_roles',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'portal_user_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'role', type: 'text', notNull: true, immutable: true },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["role IN ('platform_admin', 'support')"],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['portal_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['role'],
        references: {
          schema: 'admin',
          table: 'system_roles',
          columns: ['name'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['portal_user_id', 'role'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
  },
};
```

## `admin.cell_provisioning`

Stores one resumable physical-provisioning operation for each registered cell.

```js
export const cellProvisioningSchema = {
  dbSchema: 'admin',
  table: 'cell_provisioning',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'cell_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'operation_id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'requested_action',
      type: 'text',
      notNull: true,
      default: 'provision',
    },
    { name: 'stage', type: 'text', notNull: true, default: 'registered' },
    { name: 'status', type: 'text', notNull: true, default: 'queued' },
    { name: 'attempts', type: 'integer', notNull: true, default: 0 },
    { name: 'failure_code', type: 'varchar(64)' },
    { name: 'started_at', type: 'timestamptz' },
    { name: 'completed_at', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['cell_id'], ['operation_id']],
    checks: [
      "requested_action IN ('provision', 'activate')",
      "stage IN ('registered', 'setup', 'migration', 'seed', 'activation', 'complete')",
      "status IN ('queued', 'running', 'failed', 'completed')",
      'attempts >= 0',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['cell_id'],
        references: { schema: 'admin', table: 'cells', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [{ columns: ['status', 'stage'] }],
  },
};
```

## `admin.provisioning_jobs`

Stores one active cell-side provisioning request for a membership.

```js
export const provisioningJobsSchema = {
  dbSchema: 'admin',
  table: 'provisioning_jobs',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'membership_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'kind', type: 'text', notNull: true, immutable: true },
    { name: 'status', type: 'text', notNull: true, default: 'queued' },
    { name: 'attempts', type: 'integer', notNull: true, default: 0 },
    { name: 'result_entity_id', type: 'uuid' },
    { name: 'failure_code', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "kind IN ('employee', 'client', 'vendor', 'vendor_contact')",
      "status IN ('queued', 'running', 'failed', 'completed')",
      'attempts >= 0',
      "(status = 'completed' AND result_entity_id IS NOT NULL AND failure_code IS NULL) OR status <> 'completed'",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['membership_id'],
        references: {
          schema: 'admin',
          table: 'portal_user_tenants',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['membership_id'],
        unique: true,
        where: "deactivated_at IS NULL AND status IN ('queued', 'running')",
      },
      { columns: ['status'] },
    ],
  },
};
```

## `admin.module_entitlements`

Stores the current central decision for one tenant and module.

```js
export const moduleEntitlementsSchema = {
  dbSchema: 'admin',
  table: 'module_entitlements',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'module', type: 'text', notNull: true, immutable: true },
    { name: 'enabled', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'module']],
    checks: ['revision > 0'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [{ columns: ['tenant_id', 'enabled'] }],
  },
};
```

## `admin.cache_revisions`

Stores a monotonically increasing revision for each cache dependency.

```js
export const cacheRevisionsSchema = {
  dbSchema: 'admin',
  table: 'cache_revisions',
  columns: [
    { name: 'domain', type: 'text', notNull: true, immutable: true },
    { name: 'entity', type: 'text', notNull: true, immutable: true },
    { name: 'revision', type: 'bigint', notNull: true, default: 1 },
    {
      name: 'updated_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
    },
  ],
  constraints: {
    primaryKey: ['domain', 'entity'],
    checks: ['revision > 0'],
  },
};
```

## `admin.managed_events`

Stores append-only administrative events. Actor references are values rather
than foreign keys so an event remains readable after account changes.

```js
export const managedEventsSchema = {
  dbSchema: 'admin',
  table: 'managed_events',
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'deduplication_key', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'occurred_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
      immutable: true,
    },
    { name: 'request_id', type: 'uuid', immutable: true },
    { name: 'event_key', type: 'varchar(128)', notNull: true, immutable: true },
    { name: 'outcome', type: 'text', notNull: true, immutable: true },
    { name: 'actor_id', type: 'uuid', immutable: true },
    { name: 'effective_user_id', type: 'uuid', immutable: true },
    { name: 'tenant_id', type: 'uuid', immutable: true },
    { name: 'target_type', type: 'varchar(64)', immutable: true },
    { name: 'target_id', type: 'uuid', immutable: true },
    { name: 'session_id', type: 'uuid', immutable: true },
    { name: 'reason', type: 'varchar(512)', immutable: true },
    {
      name: 'details',
      type: 'jsonb',
      notNull: true,
      default: "'{}'::jsonb",
      immutable: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['deduplication_key']],
    checks: ["outcome IN ('succeeded', 'failed', 'denied')"],
    indexes: [
      { columns: ['occurred_at'] },
      { columns: ['actor_id', 'occurred_at'] },
      { columns: ['tenant_id', 'occurred_at'] },
      { columns: ['event_key', 'occurred_at'] },
    ],
  },
};
```

## Model-Specific Operations

Generic model methods cover normal inserts and updates. These operations need
named methods because they enforce narrower field selection or atomic changes:

- `portal_users.findCredentialByEmail(email)` selects the password hash for authentication.
- Ordinary `portal_users` reads never select `password_hash`.
- `login_throttles.recordFailure(key, now)` updates the failure window atomically.
- `cache_revisions.advance(domain, entity)` performs `revision = revision + 1` in the source transaction.
- `managed_events.append(event)` is the only runtime write method for events.
- `sessions.findByTokenHash(hash)` selects one active session for resolution.

## Migration-Only Protections

The migration adds database triggers that:

- reject primary-key changes;
- maintain `updated_at` on audit-enabled tables;
- reject updates and deletes on `managed_events`;
- reject changes to the root user's `email`, `status`, `is_root`, and archive state;
- reject a null membership `member_type` unless the membership belongs to the
  root user and Napsoft tenant;
- reject removal, suspension, reassignment, or archival of the root membership;
- reject changing `tenants.cell_id` after provisioning starts or memberships exist.
