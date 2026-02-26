# Entity Lifecycle Rules

## Core Entities

| Entity | Table | Source-Linked | Notes |
|--------|-------|---------------|-------|
| Vendor | `vendors` | Yes | Auto-creates sources record on create |
| Client | `clients` | Yes | Auto-creates sources record on create |
| Employee | `employees` | Yes | Auto-creates sources record; manages nap_users lifecycle |
| Contact | `contacts` | Via source_id | Linked to vendor/client/employee through sources |
| Address | `addresses` | Via source_id | Linked to vendor/client/employee through sources |
| Inter-Company | `inter_companies` | No | Standalone entity, no source linkage |

## Auto-Source Creation

When a vendor, client, or employee is created, a `sources` record is automatically inserted in the same transaction:

1. Insert the entity record
2. Insert a `sources` record with `table_id = entity.id` and appropriate `source_type`
3. Update the entity to set `source_id = source.id`

This guarantees every source-linked entity has a valid source before contacts or addresses are attached.

## Employee is_app_user Lifecycle

Employees have an `is_app_user` boolean that controls whether they have a login account in `admin.nap_users`.

### Provisioning (is_app_user toggled ON)

- Email is required when `is_app_user = true`
- A temporary random password is generated and bcrypt-hashed
- A `nap_users` record is created with `entity_type = 'employee'`, `entity_id = employee.id`, `status = 'invited'`
- If an archived nap_user already exists for this employee, it is restored instead of creating a new one

### Archiving (is_app_user toggled OFF or employee archived)

- The linked `nap_users` record is soft-deleted (`deactivated_at = NOW()`)
- Status is set to `locked`
- The user can no longer log in

### Restoring (employee restored while is_app_user = true)

- The linked `nap_users` record is restored (`deactivated_at = NULL`)
- Status is set to `active`

## Auto-Numbering and Code Assignment

Vendors, clients, employees, and contacts have a nullable `code` column populated by the tenant-scoped numbering system:

- On entity creation, if `code` is not provided and numbering is enabled for that entity type, `allocateNumber()` assigns the next code in the configured format
- If `code` is explicitly provided, it is used as-is (no auto-numbering)
- If numbering is disabled, the entity is created with `code = NULL`

### Backfill on Enable

When a tenant first enables numbering for an entity type, all existing records with `code IS NULL AND deactivated_at IS NULL` are backfilled in `created_at` order. This includes the admin employee created during tenant provisioning. See PRD §3.13.9.

## Soft Delete Convention

All entity tables use `softDelete: true` with a `deactivated_at` column:

- Active records: `deactivated_at IS NULL`
- Archived records: `deactivated_at IS NOT NULL`
- Use `includeDeactivated: true` query param to include archived records in list queries
- Unique constraints use `WHERE deactivated_at IS NULL` to allow re-creation of previously archived codes

## Cascade Delete via Sources

Contacts and addresses are linked via `source_id FK -> sources.id ON DELETE CASCADE`. When a source is deleted, all linked contacts and addresses are automatically removed. Entity tables (vendors, clients, employees) also have `source_id FK -> sources.id ON DELETE CASCADE`.
