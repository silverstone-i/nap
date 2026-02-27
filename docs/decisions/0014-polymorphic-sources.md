# ADR-0014: Polymorphic Sources Pattern

**Status**: Accepted
**Date**: 2025-02-22

## Context

Vendors, clients, and employees all need contacts, addresses, and phone numbers. Without a shared linkage mechanism, each entity type would need its own contacts, addresses, and phone number tables, leading to table proliferation and duplicated logic.

## Decision

Introduce a **sources** table as a polymorphic discriminated union. Each vendor, client, or employee automatically gets a linked sources record on creation. Contacts, addresses, and phone numbers reference the source_id, providing a single FK regardless of the parent entity type.

### Table Structure

```
sources: id, tenant_id, table_id, source_type CHECK('vendor'|'client'|'employee'|'contact'), label
  unique(table_id, source_type)

vendors.source_id  FK-> sources.id CASCADE
clients.source_id  FK-> sources.id CASCADE
employees.source_id FK-> sources.id CASCADE
contacts.source_id FK-> sources.id CASCADE

addresses.source_id FK-> sources.id CASCADE
phone_numbers.source_id FK-> sources.id CASCADE
```

### Auto-Source Creation

Entity controllers (vendors, clients, employees) auto-create the source record inside a transaction:

1. Insert entity (vendor/client/employee)
2. Insert source with `table_id = entity.id`, `source_type = 'vendor'|'client'|'employee'`
3. UPDATE entity SET source_id = source.id

This ensures every entity has a source before addresses or phone numbers can be attached.

> **Note:** The admin employee created during tenant provisioning is inserted via raw SQL (not through `employeesController`), so it does not get an auto-created sources record. Phone numbers and addresses cannot be linked until a source is manually created for that employee.

## Consequences

- **Single FK path** for addresses and phone numbers regardless of parent entity type
- **No table duplication** for shared child records
- **Cascade deletes** automatically clean up addresses/phone numbers when a source (or parent entity) is removed
- **Extra join** required when querying from address/phone back to the parent entity
- **source_type CHECK constraint** must be updated when new entity types are added
