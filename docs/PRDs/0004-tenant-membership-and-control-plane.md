# 0004 — Tenant membership and control plane

**Design:** Accepted (owner approved, 2026-09-08).
**Implementation:** Verified upon merge of [PR #17](https://github.com/silverstone-i/nap/pull/17) with required checks passing, including TEN-008/TEN-009. The one-cell baseline was verified by PR #15. TEN-010 Register cell changes are Verified upon merge of [PR #24](https://github.com/silverstone-i/nap/pull/24) with required checks passing; see the [delivery evidence](../implementation-plans/database-provisioning.md).

## Authority

Implements ARCH-005 through ARCH-010, ARCH-013 through ARCH-023, ARCH-028,
ARCH-039, ARCH-040, and ARCH-044 through ARCH-050 of the platform specification.
ADR 0006 records central platform authority. PRD 0005 owns linked Core records.

## Accepted requirements

- **TEN-001 Registry.** Tenants retain pending/active/suspended status and gain
  starter/growth/enterprise tier (existing default starter) and a cell assignment.
  Activation requires its registered assigned cell. Active tenant assignment
  changes are refused. Cell rows contain a UUID, database name, and enabled flag,
  never credentials. Operator-only contracts may identify these records.
- **TEN-002 Membership.** Bindings carry employee/client/vendor type and a Core
  record id; root alone has neither. Serialize each identity's membership changes.
  Multiple active bindings require all to be vendor bindings. Revocation takes
  effect centrally before cell synchronization. Root retains its sole binding.
- **TEN-003 Sessions.** After any required password change, every vendor selects
  an eligible tenant after login, including a vendor with one membership.
  A non-vendor with one eligible membership enters that tenant. Multiple choices
  produce a selection session; zero choices refuse login unless central grants
  permit a platform-only session. Selection validates membership intent against
  current state, rotates the reference, and retains absolute expiry.
  Customer views disclose no cell identifiers. Tenant data requires one active
  tenant assigned to a configured cell; restricted sessions cannot access it.
  PostgreSQL is checked on every request. The persistent vendor Change tenant
  action returns to the same selection page; SHELL-003 owns its presentation.
- **TEN-004 Platform grants.** Central route-action permissions govern registry,
  provisioning, memberships, grants, audit, access, and impersonation.
  [RBAC-006](0006-role-based-access-control.md#rbac-006--permanent-built-in-roles)
  owns platform administrator and shared support policy. Root remains protected.
  Platform grants do not authorize ordinary business routes.
- **TEN-005 Controlled access.** Access and impersonation name one tenant and
  require a nonempty reason. Impersonation additionally names an active ordinary
  member, cannot target root, cannot nest, and never inherits platform privileges.
  Every request rechecks the authenticating operator and grants as well as the
  effective identity and membership. Audit attribution preserves the operator.
  Append-only start/end/mutation events carry operator, effective user, tenant,
  reason and operation identifiers. Audit failure prevents the action.
- **TEN-006 Provisioning.** A durable admin job links a tenant and membership to
  a preallocated Core record id. No password is stored in job payloads. New
  identities use a hashed temporary password and must change it. Existing email
  identities retain credentials. Only confirmed Core records and projections
  enable memberships. Failures leave inaccessible, resumable work. Activation
  requires initial employee administrator, projections, seed state and negative
  isolation proof. TEN-011 owns the greenfield operator bootstrap exception.
- **TEN-007 Web.** Provide tenant picker, password-change restriction, operator
  registry/grant/provisioning/member forms, status/retry, audit review and controlled
  access banner/exit. Clear tenant data after switching and validate replies.

## Data ownership

Admin-tenancy extends tenants, portal_users, portal_user_tenants and sessions;
adds cells, platform_grants, provisioning_jobs and managed_events. Standard
central mutable columns apply except managed_events, which is append-only.
Sessions retain the real operator and optional effective user and access mode.
Provisioning jobs persist a stage and safe failure code, never credentials.
Migration refuses unexplained existing non-root memberships.

### Cell projections

Cell-tenancy owns cell.tenants and cell.tenant_user_bindings, copied from named
admin tenant and binding ids/status/type/record columns. Synchronization services
alone write them; they expose no routes. Tenant-inclusive keys and RLS apply.
Central records remain authoritative, including while a projection is stale.

## Physical data contract

All new admin tables carry the Central mutable profile except `managed_events`,
which retains standard audit timestamps/actors but has no soft deletion and
rejects UPDATE/DELETE even through an owner connection. Its runtime grants are
SELECT/INSERT only. Frozen migrations own constraint names and executable DDL.

| Table                 | Additional fields and constraints                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`             | `tier text` (starter default), nullable `cell_id uuid` FK cells, `provisioned boolean` (false), monotonic `revision integer` (1); cell FK indexed                               |
| `portal_users`        | `must_change_password boolean` (false)                                                                                                                                          |
| `portal_user_tenants` | nullable `user_type text` and `entity_id uuid` (root exception), `ready boolean` (false), `revision integer` (1); unique live tenant/record binding                             |
| `sessions`            | nullable selected `tenant_id`; nullable `access_mode`, `effective_user_id` FK portal_users, and `access_reason`; original reference and expiry contract retained                |
| `cells`               | `database_name text`, `enabled boolean`; unique live database name                                                                                                              |
| `platform_grants`     | `portal_user_id` FK portal_users, legacy `role` package_admin/support and route `permission`; current role/policy storage is owned by PRD 0006; unique live identity/permission |
| `provisioning_jobs`   | tenant and membership FKs, preallocated record and optional vendor IDs, kind employee/client/vendor, stage pending/complete/failed and nullable safe failure code               |
| `managed_events`      | operator ID, optional effective-user/target/session IDs, event and reason; immutable creation record                                                                            |

The membership id and tenant revision are projected with the source fields.
Projection updates compare revisions; older state never replaces newer state.
Preallocated cell primary keys deliberately have no generated model default so
pg-schemata preserves the source ID. Vendor contacts use a composite indexed FK
to the same-tenant vendor. Runtime timestamps are enforced by database triggers.

## API and initial permission policy

The heading is retained for existing links. The policy below describes current
access; PRD 0006 owns the replacement of the original per-user grants.

All endpoints use the existing versioned envelopes and shared Zod contracts.
The shared `transport/control.ts` definitions enumerate the request fields.

| Endpoint under `/api`                      | Access and behavior                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin-tenancy/v1/auth/memberships`   | Unrestricted-password session; returns this identity's active memberships without cell information                               |
| `POST /admin-tenancy/v1/auth/select`       | Membership intent only; rejects another identity's binding and unusable assignments                                              |
| `POST /admin-tenancy/v1/auth/access`       | Explicit current access or impersonate permission, tenant target and reason                                                      |
| `POST /admin-tenancy/v1/auth/end-access`   | Ends the current controlled context and rotates into selection state                                                             |
| `GET /admin-tenancy/v1/control/overview`   | Central overview permission; operator registry, members, jobs and grants                                                         |
| `POST /admin-tenancy/v1/control/registry`  | Register/update cells, create pending tenants, update tier/pending assignment, suspend/resume provisioned tenants                |
| `POST /admin-tenancy/v1/control/members`   | Provision or revoke a typed membership                                                                                           |
| `POST /admin-tenancy/v1/control/provision` | Retry a job, activate a tenant, or retry the saved operator bootstrap                                                            |
| `POST /admin-tenancy/v1/control/grants`    | Legacy endpoint; grant commands return conflict. Current assignments use `POST /admin-tenancy/v1/control/role-policy` (PRD 0006) |
| `GET /admin-tenancy/v1/control/audit`      | Audit-review permission; latest managed events                                                                                   |
| `GET /core/v1/identity/profile`            | Own linked record; controlled direct access may name a record/kind within its selected tenant                                    |

Central route keys use `admin-tenancy::control::<action>`. PRD 0006 owns
current platform-role assignments and shared support permissions. Root retains
its protected authority. Controlled sessions cannot administer grants or the
registry; impersonated profile reads use the effective membership's record.

Overview and audit replies are capped at 200 records for this initial operator
surface. Customer membership listing is complete. Broader operator pagination,
business permissions and module licensing have separate contracts in PRDs 0006/0007.

## Recovery and operational defaults

Runtime connections are built from registered UUID-keyed `CELL_DATABASES_*`
entries under the specification's Environment configuration contract (ADR 0012).
Register cell runs cell setup, migrations, and activation under ADR 0014.
Admin setup, migration, and bootstrap remain CLI operations. Access-maintenance
commands select an explicit cell UUID. Migrations grant the fixed nap_app role. Neither
connection credentials nor cell IDs enter customer session contracts.

A new member operation commits a pending job and returns its ID before any cell
write.

The web form follows that reply with an explicit retry command carrying
the name. A new member operation persists only identity metadata and record IDs centrally;
the person's display name lives in Core. If the first cell write fails, retry
requires the name again. Once the cell record exists, replay needs only the job
ID. Passwords are hashed before storage and are never persisted in jobs.

A missing name before first-time record creation returns `INVALID_INPUT` without
changing the durable job status.

A cell synchronization failure returns normal
command completion with failure visible in the job's status;
it never activates the membership. Revocation queues a job for projection retry
and denies access centrally immediately.

New tenant activation requires every
active membership ready and at least one confirmed employee administrator.

Greenfield root bootstrap records durable intent and completes automatically on the first successful available cell (ADR 0015). It creates the root projection without an employee record, preserves credentials, and refuses reassignment. Root-only bootstrap retry uses the saved operation, never a replacement cell. Existing installations are not enrolled.
Tenants with existing memberships cannot change assignment even while pending;
movement requires the later dedicated workflow.

## Acceptance and rollout

The capability plan owns execution order and test scenarios. Additive migrations
precede deployment. Register cell runs its accepted provisioning workflow; the worker completes saved greenfield operator bootstrap under ADR 0015. Initial admin creation and migration remain CLI operations. Failed stages are retried, not automatically
activated. Reverting application security behavior requires session revocation.

## Multi-cell delivery — 2026-09-08

**Design:** Accepted by implementation authorization. **Implementation:** Verified upon merge of [PR #17](https://github.com/silverstone-i/nap/pull/17) with required checks passing; see the [multi-cell plan](../implementation-plans/0004-cell-tenancy-and-provisioning.md#local-evidence--2026-09-08).

- **TEN-008 Routing.** Implement the specification's shared-origin routing contract
  and ADR 0011. TEN-003 selection and TEN-005 controlled transitions validate
  central assignments; in-process dispatch selects the UUID-keyed database.
  Central operations remain available when an individual cell is down.
- **TEN-009 Activation proof.** Confirm current tenant and every active binding
  projection, linked Core records and initial employee inside the assigned cell.
  Prove those records are invisible under an unrelated tenant transaction before
  activation. Retry incomplete work with the existing job identifiers. Active
  activation replay may return success only after repeating these checks.

[CI on the reviewed implementation](https://github.com/silverstone-i/nap/actions/runs/34314494340) passed; required CI must also pass on the final PR head.

## RBAC adoption (2026-09-09)

ADR 0008 and PRDs 0006–0008 (RBAC, module entitlements, and company/project scope records) replace the initial authorization policy: platform_admin
replaces package_admin, support grants are shared and editable only by platform
administrators, and tenant roles resolve in Core. The revision history retains the pre-RBAC delivery evidence. Current
requirements use the accepted RBAC policy. RBAC changes are Verified upon merge of [PR #18](https://github.com/silverstone-i/nap/pull/18) with required checks passing. See the
[delivery plan](../implementation-plans/0006-rbac-and-module-entitlement.md).
Self-profile remains available; broader access requires current scoped grants.
New provisioning seeds the initial tenant administrator before activation.
Existing privileged identities require reviewed transition mappings.

## Authorization cache integration

Derived lookups follow ARCH-029 and [ADR 0009](../ADRs/0009-authorization-cache-freshness.md).
Session credentials, identity eligibility and expiry writes remain PostgreSQL-backed.
Cached membership eligibility includes the selected tenant revision. Database triggers
invalidate principal, tenant, support and routing revisions inside the modifying
transaction, including provisioning and administrative scripts. Redis failure does
not change session, revocation or controlled-access outcomes.

**Authorization cache implementation:** Verified upon merge of [PR #20](https://github.com/silverstone-i/nap/pull/20) with required checks passing. See the
[verification record](../implementation-plans/authorization-cache-acceleration.md#verification).

## Vendor selection amendment — accepted

TEN-003 contains the current selection contract. This retained amendment anchor
records its adoption under ADR 0010; it does not define a second selection policy.

See [PRD 0009](0009-product-shell-and-navigation.md) and
[ADR 0010](../ADRs/0010-product-shell-and-vendor-selection.md).
Owner accepted this amendment with PRD 0009 implementation on 2026-09-10.
Its implementation evidence is tracked in the shell delivery plan, separately
from the earlier Verified status.

## Shell provisioning integration — accepted

[PRD 0009 SHELL-002](0009-product-shell-and-navigation.md#shell-002--business-navigation)
owns initial shell exposure of tenants, portal users, and employees for the
TEN-006/007 provisioning workflow. Its presentation work retains the existing
provisioning, membership, permission, retry, and activation contracts.

Shell implementation exposes permitted portal identity/status and provisioning
relationships through the existing control overview contract. Customer membership
choices include their tenant identifier for checked deep-link matching and omit
unusable assignments. Shared transport schemas own the exact response fields;
no credentials or cell addresses are added to customer contracts.

## TEN-010 — Cell registration and provisioning UI

**Design:** Accepted by owner, 2026-09-11. New implementation evidence is tracked
in the [UI delivery plan](../implementation-plans/0004-cell-registration-and-tenant-provisioning-ui.md).

Authorized operators register a suffix and see its full environment-specific database
name. Register commits a disabled cell and durable operation, then provisions,
migrates, seeds, persists configuration, loads the pool and routers, and activates.

The Cells page displays copyable UUID, database name, status, and state-dependent
Retry/Activate/Disable actions. No code or editable label remains.

Registry permission
controls mutations; overview permission controls viewing. The server selects DEV/PROD;
TEST is available only through the shared service for fixtures.

Browser closure does
not cancel work; retry resumes the same UUID and saved stages. Disable requires a
confirmation explaining assigned tenant access loss. Progress and safe errors are
visible through overview.

The specification's provisioning contract owns credentials,
physical identity, recovery, and live pool lifecycle (ADR 0014).

Tenant creation offers enabled cells only and links to cell setup when none exist.
Existing employee provisioning and activation use TEN-006/TEN-009 and PRD 0006:
a sole eligible employee may be preselected; multiple employees require a choice.

Show assigned cell, readiness, durable job stage and safe failure information,
with explicit refresh and retry. Preserve a created job ID when synchronization
fails; retry that job without recreating membership. Do not equate HTTP success
with provisioning completion or status unavailability with success.

Ask for the
name again when the first Core write requires it. Never persist passwords in UI
storage or jobs.

After activation explain first login and required temporary
password change; existing linked identities retain their credentials.

UI verification: Verified upon merge of [PR #23](https://github.com/silverstone-i/nap/pull/23) with required checks passing.
The UI delivery plan records browser/API evidence and review fixes; historical
Verified entries retain their original scope.

## Database provisioning integration

[TEN-010](#ten-010--cell-registration-and-provisioning-ui) connects management
registration to the specification's [Database provisioning](../specs/nap-platform-specification.md#database-provisioning)
contract. [TEN-011](#ten-011--operator-bootstrap-completion) owns operator
bootstrap completion.

## TEN-011 — Operator bootstrap completion

Design: Accepted, 2026-09-13. Implementation: Verified upon merge of [PR #25](https://github.com/silverstone-i/nap/pull/25) with required checks passing.

The specification and ADR 0015 own the greenfield lifecycle. Overview exposes safe bootstrap status, RBAC readiness and protected-root metadata to authorized operators. Replace the manual reconcile command with bootstrap-retry naming the saved operation. Cell success is independent of bootstrap failure. Completion verifies projections, root role assignment and isolation before marking readiness.

## Revisions

Historical entries below record the state at each delivery date. Current
requirements are in the subject sections above.

| Date       | Change                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | Accepted owner-approved control-plane design; implementation started.                                    |
| 2026-09-08 | Completed implementation and local acceptance checks; merge and CI remain pending.                       |
| 2026-09-08 | Clarified retry validation errors separately from durable cell synchronization failures.                 |
| 2026-09-08 | Reconciled verification for PR #15; status becomes effective on merge with required checks passing.      |
| 2026-09-08 | Accepted TEN-008 and TEN-009, extending one-cell selection and provisioning under ADR 0007.              |
| 2026-09-09 | Recorded revision-checked authorization cache integration without changing access semantics.             |
| 2026-09-09 | Added proposed shell-related amendment for review; preserved accepted baseline and verification history. |
| 2026-09-09 | Linked the initial tenant-provisioning shell requirements in PRD 0009.                                   |
| 2026-09-10 | Accepted shell integration with PRD 0009 implementation; historical verification preserved.              |

Revision, 2026-09-11: Owner accepted TEN-010 for the cell registration and tenant
provisioning UI; prior implementation verification remains historical.

Revision, 2026-09-11: ADR 0011 supersedes ADR 0007 topology. Sessions resolve centrally without cell reads; module requests and provisioning select UUID-keyed database handles inside one API process. Individual cell outages do not block central operations.

Revision, 2026-09-12: Adopted ADR 0012 configuration components and explicit cell command selection; provisioning behavior unchanged.

Revision 2026-09-12: accepted provisioning script integration and consolidated baseline.

Revision 2026-09-13: owner approved full Register cell workflow and UUID/database-name interface. Implementation in progress.

Revision 2026-09-13: reconciled PR #24 implementation and verification evidence;
Register cell verification becomes effective on merge with required checks passing.

Revision 2026-09-14: reconciled PR #25 verification; status becomes effective on merge with required checks passing.

Verification evidence: 287 repository tests and all required local checks pass;
[CI on the reviewed implementation](https://github.com/silverstone-i/nap/actions/runs/34234767998) passed. The final PR head must also pass required CI before merge.

Revision 2026-09-15: consolidated current requirements and references; repaired revision tables without changing historical evidence or runtime behavior.

Revision 2026-09-15: replaced copied infrastructure requirements with references to cell registration and operator bootstrap contracts.
