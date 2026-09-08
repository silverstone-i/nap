# Tenant membership and control plane implementation plan

## Features

- [x] Membership listing, selection, and switching.
- [x] Tenant tiers/status, cell registry, and authoritative assignment.
- [x] Minimal Core employee, client, vendor, and vendor-contact records.
- [x] Controlled identity provisioning and mandatory initial password change.
- [x] Central platform grants and audited access/impersonation.
- [x] Recoverable one-cell provisioning, projections, and activation.
- [x] Tenant picker and operator administration screens.
- [x] Authentication verification and reconciled capability evidence.

## Accepted design and delivery

Owner approved the complete plan on 2026-09-08. Implement PRD 0004 and the
minimal Core slice in PRD 0005 in one capability PR. ADR 0006 records the
platform amendments. No commit, push, or merge is performed without shipping
instructions. Preserve unrelated working-tree changes and real configuration.

## Order and verification

Amend the specification and PRDs first; add frozen migrations and repositories;
implement authoritative session/permission services and durable provisioning;
register factory-generated routes; implement web flows; then run security,
isolation, migration, contract, and web tests followed by every repository check.
Tests must exercise concurrent memberships, stale/revoked state, wrong-cell
access, temporary-password restrictions, impersonation audit/attribution,
provisioning failure/retry, root preservation, and fresh/upgraded databases.

## Rollout and recovery

Run explicit admin and cell migrations before deploying the application. Run
operator reconciliation explicitly. Runtime never seeds or migrates. Incomplete
provisioning remains inaccessible and retryable. Keep additive data on rollback;
revoke affected sessions before deploying older code without the new gates.
Redis, email, full business RBAC, tenant movement, and second-cell deployment
verification remain deferred. **Implementation:** Verified upon merge of [PR #15](https://github.com/silverstone-i/nap/pull/15)
with required checks passing.

## Completed evidence — 2026-09-08

All 287 repository tests pass: 28 toolchain, 206 API (including 25 authentication
and 16 control-plane integration cases), 40 web, and 13 shared. Lint, typecheck,
build, formatting, licenses (220 production records), and diff checks pass.

Disposable PostgreSQL tests prove pending jobs commit before cell work, retries
reuse stable IDs after a cell commit/central-finalization failure, activation
refuses incomplete setup, ordinary and controlled access honor current authority,
and root binding ownership/readiness cannot be changed. Negative tests cover
all six new cell tables and tenant-inclusive vendor relationships. Existing
fresh/staged authentication migrations and the explicit rejection of unexplained
legacy bindings pass.

Browser verification against a disposable API/database confirmed login, account
navigation, cell save, pending tenant creation and tenant selection. The final
administration page saved successfully with no new console errors or warnings.
Verification resources were closed and cleaned up; real environments were not
modified. Authentication PRD 0003, its plan and roadmap now record PR #14 as
Verified with its existing merge/CI evidence.

Implementation and review fixes are committed in [PR #15](https://github.com/silverstone-i/nap/pull/15).
No deployment was performed. Verified status becomes effective upon merge of
PR #15 with required checks passing.

Review regression coverage verifies rejected/failed session extensions clear audit
attribution, missing first-write names leave retry jobs unchanged, and safe login
destinations survive session remounting. The initial PR CI run exposed the login
redirect race; [CI on the reviewed implementation](https://github.com/silverstone-i/nap/actions/runs/34234767998) passed after the fix.
Required CI must also pass on the final documentation commit before merge.
