# 0008 — Scoped RBAC and module entitlements

- **Status:** Accepted
- **Date:** 2026-09-09
- **Requirements:** ARCH-022, ARCH-023, ARCH-040, ARCH-047, ARCH-048, ARCH-050

## Decision

Adopt PRD 0006 scoped additive roles, PRD 0007 explicit module entitlements, and
PRD 0008 minimal scope records. Supersede ADR 0004's package_admin name with
platform_admin while preserving root invariants. Supersede ADR 0006's per-user
support allowlist with a shared configurable support role, editable only by
platform administrators. No support tenant-business permission is enabled by
default. Existing operators require explicit mapping rather than automatic
promotion. Tenant admin authority is tenant-wide and fixed; ordinary role
management is not delegated in this release.

## Rationale and consequences

People hold different responsibilities in different companies/projects. Each
assignment therefore keeps role and scope together. Positive capabilities and
field grants accumulate without combining unrelated scopes. All includes future
records. Company/project administration supplies real scope targets without
introducing operational ERP workflows. Core remains available to recover and
administer access; Projects is the first optional module. PostgreSQL remains
authoritative; incomplete projections and transition state fail closed.

Legacy records remain for reviewed transition/recovery. Schemas migrate first;
seed scripts populate roles and never overwrite tenant customizations. No old
runtime may serve activated new policy. Other decisions in ADRs 0004, 0006 and
0007 remain in force.
