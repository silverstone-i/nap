# ADR 0008 — Soft Deletes via `deactivated_at`

**Status:** Accepted
**Date:** 2025-02-22
**Deciders:** NapSoft Engineering

## Context

Multi-tenant SaaS applications need to support data retention, audit trails, and the ability to restore accidentally deleted records. Hard deletes lose data permanently and complicate compliance with data retention requirements.

## Decision

All primary entities use **soft deletes** via a nullable `deactivated_at` timestamp column rather than hard `DELETE` statements.

### Convention

| Column | Type | Default | Meaning |
|--------|------|---------|---------|
| `deactivated_at` | `TIMESTAMPTZ` | `NULL` | `NULL` = active; non-null = archived |

### Behaviour

- **Queries** exclude deactivated rows by default via pg-schemata's `softDelete: true` schema option. Pass `{ includeDeactivated: true }` to override.
- **Archive** sets `deactivated_at = NOW()` and `updated_by` to the acting user.
- **Restore** sets `deactivated_at = NULL`.
- **Cascade rules**: Archiving a tenant cascades deactivation to all its active `nap_users`. Restoring a tenant does **not** cascade — users must be individually restored.
- **Root entity protection**: The root NapSoft tenant (`NAP`) cannot be archived (returns 403).

### Alternatives Considered

1. **Boolean `is_active` flag** — Less precise; doesn't record when the deactivation occurred.
2. **Hard deletes with audit log** — Loses the ability to restore records without backup restoration.
3. **Separate archive table** — Adds complexity for queries that need to join active and archived data.

## Consequences

- All list endpoints return only active records by default, reducing accidental exposure of archived data.
- Unique constraints must account for soft-deleted records (e.g., email uniqueness applies across both active and archived users).
- Storage grows over time since rows are never physically removed — acceptable for the expected data volumes.
