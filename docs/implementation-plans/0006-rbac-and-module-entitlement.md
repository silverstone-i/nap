# RBAC and module entitlement implementation plan

> Historical delivery record. Database setup commands, names, and deferrals below
> are superseded by ADR 0013 and the [current provisioning runbook](../guides/database-provisioning.md).

## Features provided

- [x] Multiple scoped role assignments and additive capabilities.
- [x] Self, selected/all companies and projects, and company-project scopes.
- [x] Positive sensitive-field grants without cross-assignment scope expansion.
- [x] Permanent platform/tenant administrator roles and configurable shared support.
- [x] Replay-safe role templates seeded outside migrations.
- [x] Explicit Projects entitlement; always-available Core.
- [x] Minimal company/project records and management screens.
- [x] Role administration, scope pickers, and effective-access explanations.
- [x] Enforcement for reads, writes, lists, imports, exports, and extensions.
- [x] Audited changes, revocation, protected administrators, and controlled access.
- [x] Explicit legacy mapping, provisioning integration, and two-cell/browser proof.

## Outcome and authority

**Plan:** Accepted by owner implementation authorization, 2026-09-09.
**Implementation:** Verified upon merge of [PR #18](https://github.com/silverstone-i/nap/pull/18) with required checks passing.

[CI on the reviewed implementation](https://github.com/silverstone-i/nap/actions/runs/34385270254) passed. Required CI must also pass on the final PR head.

Implement PRDs 0006–0008 and ADR 0008 in one capability change on codex/rbac.
Shipping is authorized through PR #18. Specification
ARCH-006, ARCH-013–ARCH-023, ARCH-029, ARCH-040, ARCH-043, ARCH-045,
ARCH-047–ARCH-050 govern. The owner approved the role model, explicit module
grants, Core foundation, minimal company/project UI, shared support permissions,
explicit legacy mapping, and tenant-admin-only role management.

## Delivery sequence

1. Adopt the specification amendments, ADR, and component data/API contracts.
2. Add frozen admin/cell migrations and registered models. Core owns roles,
   assignments and companies; Projects owns projects; admin owns grants and
   entitlements; cell-tenancy owns revisioned entitlement projections.
3. Add idempotent seed and explicit transition commands. Preserve root and
   legacy rows; fail on unmapped existing privileged users. Seed initial tenant
   administration as part of recoverable provisioning before activation.
4. Replace hard-coded business grants with current authorization. Bind each
   grant to scope, constrain queries before pagination/counting, check mutation
   targets atomically, omit protected response fields, and reject protected
   writes/query inference. Preserve exactly one operation tenant transaction.
5. Add factory APIs/shared contracts and web role, assignment, entitlement,
   company/project and effective-access interfaces.
6. Run narrow integration tests followed by all repository checks and real
   two-cell/browser flows. Reconcile evidence and remaining limitations here.

## Starting baseline

Before this change, session resolution granted Core/profile constants. Platform grants
used per-user package_admin/support rows. Core only had identity
records. The generic factory supports CRUD, batches and spreadsheets but lacked
resource scopes/field authorization. The implementation extends these seams without
replacing the framework or adding another persistence library.

## Verification

Cover disjoint scopes, additive grants, all/future records, parent-company
relationships, denied fields/filters/sorts/exports/imports, atomic batches,
revocation, stale entitlement projections, cross-tenant isolation, support
boundaries, last-admin protection, audit failure, transition mapping and replay.
Use test-only sensitive resources rather than inventing financial modules.
Verify browser administration and two independently credentialed cells. Run
lint, format:check, typecheck, tests, build, licenses and git diff --check with
Node 24.19.0. Record observed evidence, never infer completion from compilation.

## Rollout and recovery

Use expand-and-contract migrations. In a maintenance window migrate admin and
cells, seed definitions, apply reviewed mappings, synchronize projections, and
deploy matching API/web builds. Reject incomplete transitions before
activation. Never fall back to legacy hard-coded privileges. Preserve legacy
rows through verification. After activation recover through compatible forward
fixes or a coordinated backup restore in maintenance. Redis, billing, tier
mapping, operational accounting/scheduling, general product-shell redesign and
configurable state policy remain deferred.

## Evidence

Local verification completed on 2026-09-09 with Node 24.19.0:

- `npm test`: 314 passing tests (28 tooling, 233 API, 40 web, 13 shared).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run licenses`
  passed; 220 production package records passed the license check.
- `npm run format:check` and `git diff --check` passed.
- `apps/api/tests/integration/rbac.test.ts` exercises two independently
  credentialed cells, scoped CRUD and creation references, future records,
  executive access, controlled operator attribution, assignment revocation,
  central disable/re-enable and stale projections, shared support changes,
  final-admin protection, replay-safe seeds, audit failure, unavailable central
  entitlement state, and explicit reviewed transition/readiness.
- `rbac-fields.test.ts` uses a test-only sensitive resource through real factory
  reads, writes, lists/counts, spreadsheets and a reporting extension. Unit
  authorization tests cover additive field grants and disjoint scopes.
- Browser verification used disposable two-cell databases and the real Vite
  client: company and project creation, custom role creation, All projects
  assignment, effective-access explanation, viewer editing/admin denial, and
  platform entitlement disable/re-enable. Final reload rendered successfully.
  Development logs contained the existing hydration-fallback warning and a
  temporary HMR error while the shared package was rebuilding; no new errors
  appeared after rebuilding and reloading.

No development/production data was migrated or seeded. Temporary browser
servers were stopped and their fixture removed. Implementation and review fixes
are committed in PR #18. CI passed after isolating PostgreSQL installation from
unrelated runner APT sources in both CI and release workflows. The verification
condition becomes effective only upon merge with final-head checks passing.

## Operator transition contract

Run the existing admin/cell migration commands with their explicitly configured
migration targets during maintenance. The new admin migration initializes
`tenants.rbac_ready=false`; existing tenants cannot use the ordinary activation
command to bypass reviewed transition. New provisioning and root reconciliation
set readiness only after their cell roles are present.

Use `npm run db:access -- seed <tenant-uuid> <cell-uuid>` to create missing role definitions
without changing existing definitions or tombstones. Use
`npm run db:access -- transition <reviewed-mapping.json> <cell-uuid>` once per configured
cell; the selected UUID must equal the mapping's `cell` and the migration
target must match its runtime connection-map entry. Mapping fields are:

- `operator`: protected root portal-user UUID.
- `cell`: the selected cell UUID.
- `platform`: entries `{ "user": "<portal-user-uuid>", "role": "support" }`;
  role may be `platform_admin` or null for deliberate removal. Every legacy
  privileged identity other than root must appear explicitly.
- `tenants`: entries containing `tenant` UUID and nonempty `administrators`
  arrays of active, ready tenant membership/binding UUIDs for that cell.
  The protected root tenant may use its existing root binding.

Central mapping identifiers validate before population; each cell projection is
checked before its tenant is populated. Cell writes may survive a later
cross-database failure, but central readiness and transition audit commit only
when the selected cell's mapping completes. Replay corrects partial work.
Before first activation, partial role population therefore grants no business
access. Keep traffic closed until every cell transition, entitlement projection,
and matching API/web build is verified. Retain the coordinated backup
and legacy grants through rollout verification.

## Deliberate boundaries

The production catalog contains the delivered company/project actions and the
scoped project-company reference picker; it introduces no financial fields.
Sensitive-field enforcement is proven using test resources. Protected-field
filtering/sorting is conservatively refused for ordinary scoped users; viewing
an authorized field does not imply permission to query it across other records.
The framework validates each mounted business operation against the registered
catalog and requires a resource policy, with explicit existing self-profile and
tenant-admin service contracts. Module-specific extensions must consume that
policy when composing their queries. Accounting, scheduling, billing, Redis,
and the general product shell remain separate roadmap capabilities.
