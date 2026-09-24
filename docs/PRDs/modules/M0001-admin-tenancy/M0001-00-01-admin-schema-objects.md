# M0001-00-01: Admin Schema Objects

This chapter belongs to [M0001-00: Admin Database Foundation](M0001-00-admin-database-foundation.md)
and inherits its Implemented status. It defines the schema objects and migration
triggers for the 14 admin tables.

## Shared Rules

- UUID primary keys use `gen_random_uuid()` and cannot change.
- Audit-enabled tables add `created_at`, `updated_at`, `created_by`, and `updated_by`.
- Audit actor fields are nullable because setup and background work may not have a portal user.
- `softDelete: true` adds `deactivated_at`; ordinary reads exclude archived rows.
- Foreign keys use `ON DELETE RESTRICT`.

Migration immutability, retention, and database permissions are defined in the
parent PRD.

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
immutable `is_napsoft` flag identifies the owning tenant. Its name comes from
environment configuration. A null `cell_id` permits registration before cell
assignment.

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

Stores portal accounts, password hashes, account status, and the root-user marker.
Failed-login throttling is recorded in `admin.login_throttles` and does not
change `status`. `locked` is reserved for a future lock that an operator must clear.

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

Links portal users to tenants. `member_type` identifies the kind of member;
`member_id` stores that member’s UUID in the tenant’s cell, not a foreign key.
A `vendor_contact` member is a person working for a vendor; the vendor business
itself is never a member.

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
    { name: 'member_id', type: 'uuid' },
    { name: 'ready', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "member_type IS NULL OR member_type IN ('employee', 'client', 'vendor_contact', 'contact')",
      "status IN ('pending', 'active', 'suspended')",
      'revision > 0',
      "(member_type IS NULL AND status = 'active' AND ready = true AND member_id IS NULL) OR (member_type IS NOT NULL AND (ready = false OR (status = 'active' AND member_id IS NOT NULL)))",
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
`break_glass` is a support mode without an effective user. Its behavior is not yet specified.

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
      "access_mode IN ('normal', 'support', 'break_glass')",
      "(access_mode = 'normal' AND effective_user_id IS NULL AND access_reason IS NULL AND access_expires_at IS NULL) OR (access_mode = 'support' AND tenant_id IS NOT NULL AND access_reason IS NOT NULL AND access_expires_at IS NOT NULL) OR (access_mode = 'break_glass' AND tenant_id IS NOT NULL AND effective_user_id IS NULL AND access_reason IS NOT NULL AND access_expires_at IS NOT NULL)",
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

## `admin.support_grants`

Stores a support operator's request to act as a tenant member and the decision
on it. The member or any `tenant_admin` of the same tenant decides. A grant
expires 24 hours after the request and allows one support session, recorded in
`session_id`. Its behavior is not yet specified.

```js
export const supportGrantsSchema = {
  dbSchema: 'admin',
  table: 'support_grants',
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
    { name: 'operator_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'effective_user_id',
      type: 'uuid',
      notNull: true,
      immutable: true,
    },
    { name: 'reason', type: 'varchar(512)', notNull: true, immutable: true },
    {
      name: 'expires_at',
      type: 'timestamptz',
      notNull: true,
      immutable: true,
    },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    { name: 'decided_by', type: 'uuid' },
    { name: 'decided_at', type: 'timestamptz' },
    { name: 'session_id', type: 'uuid' },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "status IN ('pending', 'approved', 'denied', 'expired', 'used', 'cancelled')",
      'operator_id <> effective_user_id',
      "(status = 'pending' AND decided_by IS NULL AND decided_at IS NULL AND session_id IS NULL) OR (status IN ('approved', 'denied') AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND session_id IS NULL) OR (status = 'used' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND session_id IS NOT NULL) OR (status IN ('expired', 'cancelled') AND session_id IS NULL)",
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
        columns: ['operator_id'],
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
        columns: ['decided_by'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['session_id'],
        references: { schema: 'admin', table: 'sessions', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        name: 'support_grants_open_request',
        columns: ['operator_id', 'tenant_id', 'effective_user_id'],
        unique: true,
        where: "status IN ('pending', 'approved')",
      },
      { columns: ['effective_user_id', 'status'] },
      { columns: ['tenant_id', 'status'] },
      { columns: ['expires_at'] },
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

## `admin.platform_roles`

Stores active and archived assignments of any valid tenant-local role to a
portal user, including seeded system roles and tenant-defined roles.
`tenant_id` identifies the tenant whose cell contains the role; `role_id` is
that role record's UUID. The role reference crosses databases, so M0569 validates
it rather than using a foreign key.

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
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'role_id', type: 'uuid', notNull: true, immutable: true },
  ],
  constraints: {
    primaryKey: ['id'],
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
        references: {
          schema: 'admin',
          table: 'tenants',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['portal_user_id', 'tenant_id', 'role_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
  },
};
```

## `admin.cell_provisioning`

Tracks cell database setup, migration, seeding, and activation. One row per
cell records progress, attempts, failure, and completion.

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

Tracks creation of a member record in a tenant’s cell. `membership_id` references
the portal-user/tenant association; `result_member_id` stores the created member’s
UUID. Only one unarchived queued or running job is allowed per association.

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
    { name: 'result_member_id', type: 'uuid' },
    { name: 'failure_code', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "kind IN ('employee', 'client', 'vendor_contact', 'contact')",
      "status IN ('queued', 'running', 'failed', 'completed')",
      'attempts >= 0',
      "(status = 'completed' AND result_member_id IS NOT NULL AND failure_code IS NULL) OR status <> 'completed'",
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

## `admin.outbox`

Stores central tenant, membership, and entitlement changes waiting for delivery
to the tenant's cell. A row is written in the same transaction as the change it
describes, so the central change commits even when the cell is unavailable.
`revision` is the source record's revision; the cell applies a change only when
it is newer than its copy. A background worker delivers pending rows; it is not
yet built.

```js
export const outboxSchema = {
  dbSchema: 'admin',
  table: 'outbox',
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
    { name: 'topic', type: 'text', notNull: true, immutable: true },
    { name: 'entity_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'revision', type: 'integer', notNull: true, immutable: true },
    {
      name: 'payload',
      type: 'jsonb',
      notNull: true,
      default: "'{}'::jsonb",
      immutable: true,
    },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    { name: 'attempts', type: 'integer', notNull: true, default: 0 },
    {
      name: 'next_attempt_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
    },
    { name: 'delivered_at', type: 'timestamptz' },
    { name: 'failure_code', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "topic IN ('tenant', 'membership', 'entitlement')",
      "status IN ('pending', 'delivered', 'failed')",
      'revision > 0',
      'attempts >= 0',
      "(status = 'delivered' AND delivered_at IS NOT NULL AND failure_code IS NULL) OR (status <> 'delivered' AND delivered_at IS NULL)",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        name: 'outbox_change',
        columns: ['topic', 'entity_id', 'revision'],
        unique: true,
      },
      { columns: ['status', 'next_attempt_at'] },
      { columns: ['tenant_id', 'status'] },
    ],
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

## Migration-Only Protections

The migration adds database triggers that:

- reject primary-key changes;
- maintain `updated_at` on audit-enabled tables;
- reject updates and deletes on `managed_events`;
- reject changes to the root user's `email`, `status`, `is_root`, and archive state;
- reject a null membership `member_type` unless the membership belongs to the
  root user and Napsoft tenant;
- reject removal, suspension, reassignment, or archival of the root membership;
- allow the initial `tenants.cell_id` assignment from null, including for the
  owning tenant after root bootstrap; reject later reassignment or clearing when
  `provisioned = true` or any membership exists, including archived memberships.
