# 0007 — Module entitlements

**Design:** Accepted (owner implementation authorization, 2026-09-09).
**Implementation:** Verified upon merge of [PR #18](https://github.com/silverstone-i/nap/pull/18) with required checks passing.

[CI on the reviewed implementation](https://github.com/silverstone-i/nap/actions/runs/34385270254) passed. Required CI must also pass on the final PR head.

## Authority

ARCH-022, ARCH-023, ARCH-029, ARCH-047, ARCH-050; ADR 0008.

## Requirements and contracts

- **ENT-001:** Core is always available to active tenants. Projects requires an
  explicit enabled grant. Infrastructure modules never confer business access.
- **ENT-002:** Admin-tenancy stores tenant/module enabled state and monotonically
  increasing revision. Cell-tenancy projects that exact revision. Every request
  checks current central state; unavailable, disabled or stale state refuses.
  Re-enable requires confirmed projection. Changes are audited and recoverable.
- **ENT-003:** Platform administrators and support with the explicit entitlement
  capability manage grants; tenant administrators cannot enable modules.
  Tier and billing never implicitly grant access.
- **ENT-004:** GET /api/admin-tenancy/v1/control/access-overview includes entitlement
  state; POST /api/admin-tenancy/v1/control/entitlement changes or retries one
  optional module grant for a validated tenant. Core/infrastructure/unknown module
  changes are refused. New tenants start without optional grants.
- **ENT-005:** Seed/transition commands retain legacy records and refuse unmapped
  privileged identities. Root remains protected. Policy activation requires
  confirmed cell state and an active tenant administrator. Central tenants carry
  `rbac_ready`, default false on expansion. Only successful fresh provisioning,
  root reconciliation, or the reviewed transition sets it true. An existing
  provisioned tenant cannot use activation to bypass its reviewed mapping.
  Transition readiness commits with central audit only after all selected cell
  mappings succeed; partial cell work cannot activate tenant business access.

## Acceptance

Prove disable/re-enable, stale/replayed projections, failed synchronization,
revocation on the next request, two-cell isolation, unauthorized changes, and
absence of grants from tier/client state. Missing authority always refuses.

## Revisions

| Date       | Change                                          |
| ---------- | ----------------------------------------------- |
| 2026-09-09 | Accepted initial explicit entitlement contract. |

| 2026-09-09 | Reconciled verification for PR #18; effective upon merge with required checks passing. |

## Cache integration

ARCH-029 and [ADR 0009](../ADRs/0009-authorization-cache-freshness.md) permit
caching central entitlement rows and local projections under independent database
revision checks. The existing enabled-state and entitlement-revision comparison
remains mandatory. A failed projection cannot undo a central revocation; a Redis
outage cannot preserve a stale enablement. Cache UUID revisions are separate from
the entitlement's existing integer projection revision.

| Date       | Change                                                                                 |
| ---------- | -------------------------------------------------------------------------------------- |
| 2026-09-09 | Documented revision-checked entitlement caching without changing projection authority. |

**Authorization cache implementation:** Verified upon merge of [PR #20](https://github.com/silverstone-i/nap/pull/20) with required checks passing. See the
[verification record](../implementation-plans/authorization-cache-acceleration.md#verification).
