# 0010 — Product shell and vendor selection

- **Status:** Accepted (owner approved 2026-09-10)
- **Date:** 2026-09-09
- **Requirements:** ARCH-022, ARCH-023, ARCH-040, ARCH-048, ARCH-050, ARCH-051;
  specification Web structure and Web shared behavior

## Context

The initial shell must support tenant provisioning through tenants, portal_users,
and employees. Existing screen availability does not define this scope.
Business navigation labels need not match module ownership.
The current TEN-003 auto-selects a sole eligible membership, producing a
separate login path for vendors with one tenant.

## Decision

Adopt [PRD 0009](../PRDs/0009-product-shell-and-navigation.md) as the shell's
behavior owner, including its provisioning delivery inventory. Expose tenants
and portal users through Tenant Management and employees through Accounting →
Directories, retaining the existing provisioning and record-ownership contracts.
Retain two rail
levels; Directories tabs express the deeper business location.
Core remains the record owner even when screens appear under Accounting or Sales.

Require vendor tenant selection after every login regardless of eligible
membership count. This changes TEN-003's selection policy, not the membership,
session, server-routing, or controlled-access boundaries in
[ADR 0006](0006-central-platform-control.md),
[ADR 0011](0011-one-api-multiple-cell-databases.md), and
[ADR 0008](0008-scoped-rbac-and-module-entitlements.md).
Required password change still precedes selection.

Document settings and defaults before introducing persistence. Keep the existing
theme behavior; do not create speculative settings infrastructure.

## Alternatives and consequences

Selecting Companies or Projects because their screens already exist would not
satisfy the tenant-provisioning scope. A third rail level conflicts with the selected compact navigation.
Auto-selecting a vendor's sole tenant would retain two vendor login workflows.
Immediate settings persistence adds storage and management design before enough
settings have been identified.

Owner approved this decision with the implementation plan on 2026-09-10.
Documentation and code are delivered together; no delayed-code issue gate applies.
Historical verification remains distinct from this capability's new evidence.
