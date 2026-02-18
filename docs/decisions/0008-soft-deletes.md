# 0008. Soft Deletes over Hard Deletes

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP manages financial records (invoices, payments, journal entries) that are subject to audit requirements and regulatory retention. Deleting a record permanently can break referential integrity, destroy audit trails, and make it impossible to recover from accidental deletions. However, soft-deleted records must not appear in normal queries or violate uniqueness constraints against active records.

## Decision

All models use pg-schemata's `softDelete: true` option. Soft-deleted records are marked with a `deactivated_at` timestamp rather than being removed from the database.

**Behavior:**
- All read queries automatically exclude records where `deactivated_at IS NOT NULL`
- `removeWhere()` sets `deactivated_at = NOW()` instead of issuing `DELETE`
- `restoreWhere()` clears `deactivated_at` to reactivate a record
- `findSoftDeleted()` returns only deactivated records (for admin recovery UIs)
- `purgeSoftDeleteWhere()` is available for permanent removal when required (e.g., GDPR data erasure)

**Uniqueness:** Partial unique indexes use `WHERE deactivated_at IS NULL` so that soft-deleted records do not conflict with active ones (e.g., a user's email can be reused after their account is archived).

**Cascading:** Archive operations cascade to dependent records (e.g., archiving a tenant deactivates all its users).

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Hard deletes (`DELETE FROM`) | Simpler queries; no ghost data; reclaims storage immediately | Destroys audit trail; no undo without backups; breaks referential integrity if foreign keys reference deleted rows; regulatory risk for financial records |
| History/audit table (hard delete + trigger-based archival) | Clean primary tables; full history preserved separately | Complex trigger maintenance; two-table queries for undo; history table schema must mirror primary table and be kept in sync |

## Consequences

**Positive:**
- Full audit trail — every record's lifecycle is preserved in place
- Undo capability — accidental archival is trivially reversible with `restoreWhere()`
- Referential integrity preserved — foreign keys continue to resolve; no orphaned references
- Regulatory compliance — financial records are retained as required

**Negative:**
- Tables grow indefinitely with soft-deleted records — mitigated by partial indexes that exclude deactivated rows from query plans
- All unique constraints must use partial indexes (`WHERE deactivated_at IS NULL`) — a convention that must be consistently applied
- `purgeSoftDeleteWhere()` exists as an escape hatch but must be carefully governed to avoid accidental permanent data loss
