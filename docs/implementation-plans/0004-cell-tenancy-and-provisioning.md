# Cell tenancy and provisioning implementation plan

> Historical implementation record. Its inter-API topology and deployment runbook
> are superseded by [the multi-cell API plan](multi-cell-api.md) and ADR 0011.

## Features provided

- [x] Run the same API build in two cells, each connected only to the central
      administration database and its own cell database.
- [x] Keep one stable customer web/API origin while the server routes requests
      to the tenant's authoritative cell assignment.
- [x] Support login, password change, tenant selection, and vendor tenant
      switching across cells without exposing cell identifiers to customers.
- [x] Provision and activate new tenants in either registered cell through the
      existing operator interface, including initial employee records and tenant
      and membership projections.
- [x] Recover interrupted provisioning and synchronization through durable,
      idempotent retries without prematurely enabling access.
- [x] Verify activation prerequisites and negative tenant-isolation checks in
      the assigned cell before making a tenant active.
- [x] Preserve centrally enforced revocation, suspension, platform permissions,
      and audited access/impersonation across both cells.
- [x] Prove that an unavailable cell cannot redirect its tenants into another
      cell or interrupt requests for tenants in a healthy cell.
- [x] Provide repeatable deployment, verification, and recovery instructions
      for adding a second cell without moving existing tenants.

## Outcome and design status

**Plan:** Accepted by owner implementation authorization, 2026-09-08.
**Implementation:** Verified upon merge of [PR #17](https://github.com/silverstone-i/nap/pull/17) with required checks passing; local verification recorded below. ADR 0007 and the specification shared-origin routing
contract settle placement, central transitions, targeted commands and transport trust.

Complete the remaining [Cell tenancy and provisioning roadmap gate](../roadmaps/DEVELOPMENT-ROADMAP.md#cell-tenancy-and-provisioning)
using the existing one-cell implementation as the starting point. Deliver as one
capability PR, with the steps below executed within that PR. Any need to split
delivery into multiple PRs is a separate owner decision.

The [platform specification](../specs/nap-platform-specification.md) governs,
particularly ARCH-004–ARCH-011, ARCH-013–ARCH-028, ARCH-033, ARCH-039–ARCH-040,
and ARCH-042–ARCH-050. [PRD 0004](../PRDs/0004-tenant-membership-and-control-plane.md)
owns TEN-001–TEN-007 and the projection contract;
[PRD 0005](../PRDs/0005-core-identity-records.md) owns CID-001–CID-004 and the
minimal seed boundary. ADRs [0004](../ADRs/0004-seeded-root-identity.md) and
[0006](../ADRs/0006-central-platform-control.md) preserve root and central
platform authority. Cell-tenancy receives no separate PRD or public routes.

## Verified starting point

Read-only investigation on 2026-09-08 confirmed:

- The roadmap places this capability after Tenant membership and control plane.
  Its prerequisite [PR #15](https://github.com/silverstone-i/nap/pull/15) merged
  with passing [required CI](https://github.com/silverstone-i/nap/actions/runs/34235955467)
  and [release automation](https://github.com/silverstone-i/nap/actions/runs/34236242395).
  The roadmap summary still says Implemented while its detailed entry makes
  Verified conditional on that now-completed merge; reconcile this during delivery.
- `services/controlPlane.ts` already creates durable membership jobs, writes
  Core records and revisioned projections, retries failures, and activates tenants.
  Existing integration coverage is in `tests/integration/control-plane.test.ts`.
- `app.ts` and `runtime.ts` receive exactly one admin handle and one cell handle.
  Preserve this boundary; adding a map of cell database pools would violate
  ARCH-009.
- Login in `modules/admin-tenancy/domain/auth.ts`, selection and controlled
  access in `services/tenantSelection.ts`, session resolution in
  `services/sessions.ts`, and provisioning in `services/controlPlane.ts` all
  enforce the configured `CELL_CODE`. A second API process alone cannot satisfy
  shared-origin login and cross-cell switching.
- The specification shows platform routing ahead of the cell deployments but
  does not yet define its executable contract. PRD 0004 explicitly defines
  wrong-cell selection refusal for its one-cell scope.
- No open GitHub issues were returned by the repository issue listing.

Source paths above are relative to `apps/api/src/`, except test paths, which
are relative to `apps/api/`. These observations identify delivery work; they
do not make the proposed routing design an accepted requirement.

## 1. Accepted routing and provisioning contract

The owner authorized implementation on 2026-09-08. ADR 0007 and the
specification's [shared-origin routing contract](../specs/nap-platform-specification.md#shared-origin-routing-contract)
settle the design: one API artifact, an admin-only router mode, deployment-only
private origins, central account operations and independently authorized cell
requests. PRD 0004 TEN-008 and TEN-009 own the added acceptance requirements.
The changes below are delivered in PR #17 as one capability change.

## 2. Implement authoritative routing and session transitions

- Add the accepted shared-origin routing implementation and configuration
  validation in the specification-approved locations. Infrastructure destinations
  stay out of customer contracts and database credentials stay in deployment secrets.
- Adapt central authentication and session transitions to operate across eligible
  cells. Separate central session validation from destination-local tenant-data
  eligibility only as needed; preserve the destination's `CELL_CODE` check.
- Cover restricted password/selection sessions, root before reconciliation,
  ordinary tenant access, and controlled access. Maintain real-operator audit
  attribution and central revalidation on each request.
- Retain factory-generated module routes and existing envelopes. Extend shared
  schemas only for accepted operator behavior; customer URLs remain unchanged.
- Verify existing web picker, account, operator, and access-banner flows through
  the shared origin. Make only changes required for cross-cell transitions and
  safe unavailable-cell feedback; clear previous tenant data when switching.

## 3. Complete provisioning and activation across cells

- Route cell-writing commands to the authoritative assigned deployment while
  preserving the durable admin job committed before cell work.
- Reuse stable Core/projection identifiers and monotonic source revisions.
  Exercise retries after each commit boundary, including a committed cell write
  followed by failed central finalization or a lost HTTP response.
- Confirm activation checks actual assigned-cell projections and required Core
  records, not central readiness flags alone. Verify all active membership
  projections against current source state before activation, and the accepted
  negative RLS proof under the runtime role. Keep the PRD 0005 seed boundary;
  do not invent settings tables or tenant business roles.
- Ensure failed activation remains inaccessible and can be retried after repair,
  including failure after an active projection is written but before admin commit.
- Verify stale projection retries cannot undo revocation or suspension. Retain
  root's explicit reconciliation exception and the existing reassignment guards.
- Add migration changes only if the accepted design needs additional durable
  state. Use additive module-owned migrations, explicit targets, and existing
  pg-schemata repositories; services own no tables.

## 4. Verification and acceptance evidence

Create a disposable fixture with one admin database, two separately credentialed
cell databases, two API processes using the same build, and the actual routing
implementation. Put two tenants in one cell and another in the second: one
tenant per database would not prove shared-table RLS isolation.

| Scenario          | Required evidence                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provisioning      | Create and activate tenants in both cells through the public operator flow; Core rows and projections exist only in the assigned database.                                                                 |
| Authentication    | A user whose sole tenant is in Cell 2 can log in at the shared origin; password restrictions, logout and expiry remain enforced.                                                                           |
| Switching         | One vendor switches between tenants in different cells, then reads its own Core profile with the rotated cookie and unchanged origin; old cookies fail. Employee/client membership limits remain enforced. |
| Isolation         | Wrong-cell direct requests and forged routing inputs fail. Cross-tenant reads, writes, deletes and relationships fail within the shared cell; no deployment can connect to the other cell database.        |
| Activation        | Missing/stale projections, missing initial employee, failed seed confirmation or failed RLS proof prevent activation. Repair and retry succeed without duplicate records.                                  |
| Recovery          | Inject failure before cell write, after cell commit and before admin finalization, and during final activation. Restart processes and retry with stable IDs; verify no premature access.                   |
| Current authority | Revoke membership, suspend tenant, disable cell, or revoke platform grants; stale sessions/projections cannot retain or increase access. Controlled access preserves audit attribution in either cell.     |
| Cell outage       | Stop Cell 2 API or database: its requests fail safely, Cell 1 continues, and no fallback reaches Cell 1 data. Restore Cell 2 and recover pending work.                                                     |
| Client surface    | Browser verification covers login, cross-cell picker, profile, operator provision/status/retry and access exit. Customer responses, URLs and errors disclose no infrastructure details.                    |
| Deployment        | Fresh and upgraded databases pass the explicit migration path. Both cells run the same artifact with independent credentials and lifecycle.                                                                |

Run focused routing, session, provisioning and database integration tests first,
then all repository checks under `.nvmrc`: lint, typecheck, tests, build,
formatting, licenses, and `git diff --check`. Retain test commands, CI links,
failure-injection results and browser evidence in the capability PR. Reconcile
roadmap, affected PRDs and this plan before marking Verified, effective on merge
with required checks passing. One-cell tests alone cannot close this gate.

## 5. Rollout and recovery

1. Provision the second cell's database and least-privileged roles through
   explicit operator setup. Run any admin migration once and cell migrations
   against each named cell target; runtime never migrates or bootstraps.
2. Deploy the same compatible API artifact to both cells with distinct
   `CELL_CODE` and cell credentials. Validate internal destinations and health
   before enabling shared-origin routing. Keep each deployment's shutdown and
   readiness independent.
3. Register the new cell and place only new pending tenants there. Provision,
   verify and activate a disposable tenant through the stable origin before
   admitting ordinary tenant traffic.
4. On failure, stop affected provisioning/activation, preserve durable jobs and
   projections, and retry after repair. Never reassign existing tenants or delete
   partially provisioned records as an automatic recovery action.
5. Define the supported routing/API compatibility window in the accepted design.
   Revert compatible application/configuration changes without undoing additive
   data. A return to one-cell behavior must explicitly disable affected access
   and revoke incompatible sessions; it cannot silently strand or reroute Cell 2
   tenants. Prove continued Cell 1 service during Cell 2 recovery.

## Scope boundaries and main risks

Tenant movement, automatic placement, dedicated-cell/self-hosted certification,
full RBAC and module entitlement, Redis, email delivery, broader Core data, and
new background workers remain later work. This plan provisions tenants into
registered cells; it does not introduce a cloud infrastructure provisioning product.

The main risks are routing before authoritative authorization, changing the
current local-cell session guard too broadly, replaying partially committed
mutations, and treating central readiness as proof of current cell state. The
design gate and acceptance matrix address these explicitly. Shared admin/routing
availability remains a platform dependency; the outage gate concerns an
individual cell, not failure of the central control plane.

## Deployment procedure

Build once with `npm run build`. Deploy the resulting API artifact identically
in all three processes. Supply secrets through the deployment environment;
`.env.example` contains configuration names and safe local samples only.

| Process | Configuration                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Router  | `API_MODE=router`, `ADMIN_DATABASE_URL_PROD`, `CELL_API_ORIGINS`, `PORT`; no cell credentials or migration credentials. |
| Cell 1  | `API_MODE=cell`, `CELL_CODE=cell-1`, `ADMIN_DATABASE_URL_PROD`, its own `CELL_DATABASE_URL_PROD`, `PORT`.               |
| Cell 2  | `API_MODE=cell`, `CELL_CODE=cell-2`, `ADMIN_DATABASE_URL_PROD`, its own `CELL_DATABASE_URL_PROD`, `PORT`.               |

All processes use `NODE_ENV=production`, the same `SESSION_SECRET`,
`AUTH_THROTTLE_SECRET`, and cookie policy. Terminate public TLS at the shared
origin, route `/api` to router mode, and serve the existing web build there.
`CELL_API_ORIGINS` maps registered codes to private HTTPS origins. The public
origin must never be an upstream. Restrict cell API ingress to the router;
set router `TRUST_PROXY_HOPS` to its exact ingress hop count and cell APIs to
one private router hop. Default zero remains appropriate for direct local tests.

Create distinct runtime roles. Grant each CONNECT only to admin and its own
cell database; grant the router role CONNECT to admin alone. Revoke PUBLIC
CONNECT on these databases before granting the approved roles. Do this through
reviewed deployment provisioning, not ad-hoc changes to shared databases.
Run explicit `npm run db:migrate:admin` with the admin migration URL and runtime
role. Repeat the idempotent admin migration command for each distinct
`ADMIN_RUNTIME_ROLE` used by the router and cell processes so each receives
central table grants. Then run `npm run db:migrate:cell` separately for each cell with its own
migration URL and runtime role. This change adds no migrations; an existing
v0.11.0 database is compatible. Register origins and cells before assigning new
tenants, then use Administration to create a pending tenant, provision its first
employee, check job completion and activate it.

Roll back router and cell code as a compatible set. Existing sessions and tables
remain compatible within this implementation; reverting to the older one-cell
behavior requires disabling affected Cell 2 access and revoking its sessions.
Do not alter tenant assignments to make rollback appear successful. Preserve
jobs and cell records, restore the compatible routing build, and retry by job ID.
A 503 may mean a mutation committed before the reply was lost: inspect status
first; replay only the documented retry/activation operations, not user creation.

## Local evidence — 2026-09-08

- 299 repository tests pass: 28 toolchain, 218 API, 40 web and 13 shared.
  The 12 added tests cover private-origin configuration, forwarding safeguards,
  independently credentialed cell processes, central login, switching, immediate
  revocation, audited impersonation, API outage, and partial-commit recovery.
- The process fixture starts the same compiled `server.js` three times. Its
  router has admin-only database grants; cross-cell CONNECT attempts fail.
  Existing migration and shared-table RLS suites remain passing.
- Browser verification with disposable databases confirmed operator login,
  provisioning status, Cell 2 controlled access and exit, and vendor selection
  of Cell 1 followed by Cell 2 at the same origin. No console errors or warnings.
  The unavailable browser CLI was replaced by Codex's in-app browser. Temporary
  browser resources were closed and deleted after verification.
- Lint, typecheck, build, formatting, licenses and diff checks passed after the
  final review fixes on 2026-09-09 (220 production license records). No real
  environment files or databases were changed.

## Merge verification — 2026-09-09

Verified upon merge of [PR #17](https://github.com/silverstone-i/nap/pull/17) with required checks passing. [CI on the reviewed implementation](https://github.com/silverstone-i/nap/actions/runs/34314494340) passed; required CI must also pass on the final PR head.
