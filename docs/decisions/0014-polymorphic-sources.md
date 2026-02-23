# ADR-0014: Polymorphic Sources Pattern

**Status**: Accepted
**Date**: 2025-02-22

## Context

Vendors, clients, and employees all need contacts and addresses. Without a shared linkage mechanism, each entity type would need its own contacts and addresses tables, leading to table proliferation and duplicated logic.

## Decision

Introduce a **sources** table as a polymorphic discriminated union. Each vendor, client, or employee automatically gets a linked sources record on creation. Contacts and addresses reference the source_id, providing a single FK regardless of the parent entity type.

### Table Structure

```
sources: id, tenant_id, table_id, source_type CHECK('vendor'|'client'|'employee'), label
  unique(table_id, source_type)

vendors.source_id  FK-> sources.id CASCADE
clients.source_id  FK-> sources.id CASCADE
employees.source_id FK-> sources.id CASCADE

contacts.source_id FK-> sources.id CASCADE
addresses.source_id FK-> sources.id CASCADE
```

### Auto-Source Creation

Entity controllers (vendors, clients, employees) auto-create the source record inside a transaction:

1. Insert entity (vendor/client/employee)
2. Insert source with `table_id = entity.id`, `source_type = 'vendor'|'client'|'employee'`
3. UPDATE entity SET source_id = source.id

This ensures every entity has a source before contacts or addresses can be attached.

## Consequences

- **Single FK path** for contacts and addresses regardless of parent entity type
- **No table duplication** for shared child records
- **Cascade deletes** automatically clean up contacts/addresses when a source (or parent entity) is removed
- **Extra join** required when querying from contact/address back to the parent entity
- **source_type CHECK constraint** must be updated when new entity types are added
