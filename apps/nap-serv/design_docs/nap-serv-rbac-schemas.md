
# RBAC (“brace”) Table Schemas — nap-serv

Short, explicit pg‑schemata definitions for **roles**, **role_members**, and **policies**, plus reference DDL.
Use these as-is under `apps/nap-serv/core/schema/*`.

---

## Conventions

- All tables include `tenant_id` and `tenant_code`.
- Primary keys use **UUIDv7** (`uuid_generate_v7()`); replace with `gen_random_uuid()` if needed.
- Never include `tenant_code` in PK/UK/FK.
- Deny-by-default: absence of a policy ⇒ `none`.

---

## 1) roles

### Purpose
Holds both **system roles** (`tenant_id NULL`, e.g. `superadmin`, `admin`) and **tenant roles** (scoped to a tenant).

### pg-schemata (ESM)
```js
// apps/nap-serv/core/schema/roles.schema.js
export const rolesSchema = {
  dbSchema: 'public',
  table: 'roles',
  version: '1.0.0',
  hasAuditFields: true,
  softDelete: false,
  columns: [
    { name: 'id',          type: 'uuid', default: 'uuid_generate_v7()', nullable: false, immutable: true },
    { name: 'tenant_id',   type: 'uuid', nullable: true },
    { name: 'tenant_code', type: 'text', nullable: true },
    { name: 'code',        type: 'text', nullable: false }, // stable key, e.g. 'project_manager'
    { name: 'name',        type: 'text', nullable: false }, // display label
    { name: 'description', type: 'text', nullable: true },  // optional help text
    { name: 'is_system',   type: 'boolean', default: false, nullable: false },
    { name: 'is_immutable',type: 'boolean', default: false, nullable: false },
  ],
  indexes: [
    { name: 'roles_tenant_id_idx', columns: ['tenant_id'] },
    { name: 'roles_code_idx', columns: ['code'] },
  ],
  uniques: [
    { name: 'roles_tenant_code_uk', columns: ['tenant_id', 'code'] }, // unique per scope
  ],
};
export default rolesSchema;
```

### Reference DDL
```sql
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id uuid NULL,
  tenant_code text NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_immutable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_at timestamptz NULL,
  updated_by uuid NULL
);
CREATE UNIQUE INDEX roles_tenant_code_uk ON roles(tenant_id, code);
CREATE INDEX roles_tenant_id_idx ON roles(tenant_id);
CREATE INDEX roles_code_idx ON roles(code);
```

---

## 2) role_members

### Purpose
Assigns users to roles (system or tenant), scoped by tenant when applicable.

### pg-schemata (ESM)
```js
// apps/nap-serv/core/schema/role_members.schema.js
export const roleMembersSchema = {
  dbSchema: 'public',
  table: 'role_members',
  version: '1.0.0',
  hasAuditFields: true,
  softDelete: false,
  columns: [
    { name: 'id',          type: 'uuid', default: 'uuid_generate_v7()', nullable: false, immutable: true },
    { name: 'tenant_id',   type: 'uuid', nullable: true },
    { name: 'tenant_code', type: 'text', nullable: true },

    { name: 'role_id',     type: 'uuid', nullable: false }, // -> roles.id
    { name: 'user_id',     type: 'uuid', nullable: false }, // -> nap_users.id (global)

    { name: 'is_primary',  type: 'boolean', default: false, nullable: false },
  ],
  indexes: [
    { name: 'role_members_role_id_idx', columns: ['role_id'] },
    { name: 'role_members_user_id_idx', columns: ['user_id'] },
    { name: 'role_members_tenant_id_idx', columns: ['tenant_id'] },
  ],
  uniques: [
    { name: 'role_members_role_user_uk', columns: ['role_id', 'user_id'] },
  ],
};
export default roleMembersSchema;
```

### Reference DDL
```sql
CREATE TABLE role_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id uuid NULL,
  tenant_code text NULL,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, -- references nap_users(id) in global catalog
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_at timestamptz NULL,
  updated_by uuid NULL
);
CREATE UNIQUE INDEX role_members_role_user_uk ON role_members(role_id, user_id);
CREATE INDEX role_members_role_id_idx ON role_members(role_id);
CREATE INDEX role_members_user_id_idx ON role_members(user_id);
CREATE INDEX role_members_tenant_id_idx ON role_members(tenant_id);
```

---

## 3) policies

### Purpose
Grants a **level** (`none|view|full`) to a role over a resource scope triple `(module, router?, action?)`.
Most-specific wins at evaluation time: `action → router → module → default none`.

### pg-schemata (ESM)
```js
// apps/nap-serv/core/schema/policies.schema.js
export const policiesSchema = {
  dbSchema: 'public',
  table: 'policies',
  version: '1.0.0',
  hasAuditFields: true,
  softDelete: false,
  columns: [
    { name: 'id',          type: 'uuid', default: 'uuid_generate_v7()', nullable: false, immutable: true },
    { name: 'tenant_id',   type: 'uuid', nullable: true },
    { name: 'tenant_code', type: 'text', nullable: true },

    { name: 'role_id',     type: 'uuid', nullable: false },   // -> roles.id (tenant roles)
    { name: 'module',      type: 'text', nullable: false },   // e.g. 'projects','gl','ar'
    { name: 'router',      type: 'text', nullable: true },    // e.g. 'invoices'
    { name: 'action',      type: 'text', nullable: true },    // e.g. 'approve','export'
    { name: 'level',       type: 'text', nullable: false },   // 'none'|'view'|'full'
  ],
  indexes: [
    { name: 'policies_role_id_idx', columns: ['role_id'] },
    { name: 'policies_scope_idx', columns: ['module', 'router', 'action'] },
  ],
  uniques: [
    { name: 'policies_role_scope_uk', columns: ['role_id', 'module', 'router', 'action'] },
  ],
  checks: [
    { name: 'policies_level_chk', expression: "(level IN ('none','view','full'))" },
  ],
};
export default policiesSchema;
```

### Reference DDL
```sql
CREATE TABLE policies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id uuid NULL,
  tenant_code text NULL,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module text NOT NULL,
  router text NULL,
  action text NULL,
  level text NOT NULL CHECK (level IN ('none','view','full')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_at timestamptz NULL,
  updated_by uuid NULL
);
CREATE UNIQUE INDEX policies_role_scope_uk ON policies(role_id, module, router, action);
CREATE INDEX policies_role_id_idx ON policies(role_id);
CREATE INDEX policies_scope_idx ON policies(module, router, action);
```

---

## Seed example (snippet)

```sql
-- System roles (tenant_id NULL)
INSERT INTO roles (tenant_id, tenant_code, code, name, is_system, is_immutable)
VALUES (NULL, NULL, 'superadmin', 'Super Admin', true, true),
       (NULL, NULL, 'admin', 'Tenant Admin', true, true);

-- Tenant role
INSERT INTO roles (tenant_id, tenant_code, code, name)
VALUES ('{tenant_uuid}', '{tenant_code}', 'project_manager', 'Project Manager')
RETURNING id;

-- Policies for project_manager (replace {pm_role_id})
INSERT INTO policies (tenant_id, tenant_code, role_id, module, router, action, level) VALUES
('{tenant_uuid}', '{tenant_code}', '{pm_role_id}', 'projects', NULL, NULL, 'full'),
('{tenant_uuid}', '{tenant_code}', '{pm_role_id}', 'gl',       NULL, NULL, 'view'),
('{tenant_uuid}', '{tenant_code}', '{pm_role_id}', 'ar',       NULL, NULL, 'view'),
('{tenant_uuid}', '{tenant_code}', '{pm_role_id}', 'ar', 'invoices', 'approve', 'none');
```

---

## Notes on evaluation

- Server middleware resolves most‑specific match first: `(m,r,a)` → `(m,r,NULL)` → `(m,NULL,NULL)` → default `none`.
- “View” implies GET/HEAD plus any route explicitly tagged `rbac('view')` (e.g., `export`).
- “Full” required for writes and privileged actions (approve/post/close).
- System shortcuts: `superadmin` bypasses checks; tenant `admin` bypasses for their tenant except `tenants` module.

---

**File placement**
- `apps/nap-serv/core/schema/roles.schema.js`
- `apps/nap-serv/core/schema/role_members.schema.js`
- `apps/nap-serv/core/schema/policies.schema.js`

