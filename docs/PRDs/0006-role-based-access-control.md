# 0006 — Role-based access control

**Design:** Draft (owner-agreed product direction, pending adoption review).
**Implementation:** Not started.

## Authority and status

Derives from ARCH-006, ARCH-013 through ARCH-023, ARCH-029, ARCH-040,
ARCH-043, ARCH-045, ARCH-047, ARCH-048, and ARCH-050 in the
[platform specification](../specs/nap-platform-specification.md).
[PRD 0004](0004-tenant-membership-and-control-plane.md) owns central identity,
membership, provisioning, platform grants, and controlled access.
[PRD 0005](0005-core-identity-records.md) owns linked Core identity records.

This draft records the agreed target behavior for review. It does not supersede
the accepted specification, PRD 0004, or ADRs
[0004](../ADRs/0004-seeded-root-identity.md) and
[0006](../ADRs/0006-central-platform-control.md). The proposed platform role name
and support policy differ from those documents; the adoption steps below must
resolve that difference before acceptance or implementation.

## Outcome and concepts

A tenant administrator can give a person the capabilities needed for their work
in the companies and projects where they perform it, including sensitive-field
access where appropriate. Multiple responsibilities do not require a separate
role for every combination of jobs.

| Concept     | Meaning                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Capability  | An explicit business action, using the existing `module::router::action` permission vocabulary.              |
| Role set    | A named bundle of capabilities and positive sensitive-field grants; called a role in administration screens. |
| Assignment  | A connection between a tenant user, a role set, and its scope.                                               |
| Scope       | The records to which that assignment's grants apply.                                                         |
| Field group | A named collection of sensitive fields with view and, where meaningful, edit grants.                         |

## Requirements

### RBAC-001 — Capabilities and ownership

Permissions describe explicit actions rather than job titles or a universal
read/write level. Editing, approving, posting, exporting, and administering
access are distinct capabilities where the owning business workflow requires
them. Presets may bundle capabilities without making one action implicitly
authorize another.

Core owns tenant business role sets, their grants, and assignments. Central
platform grants remain owned by admin-tenancy. Request-time authorization is a
service consumed by the shared middleware boundary, following ARCH-047,
ARCH-048, and ARCH-050. Module-specific actions retain their owning PRDs.

### RBAC-002 — Scoped role assignments

Assignments bind the role and scope together. A tenant user may hold multiple
assignments, including the same role in several places and different roles on
different projects. Assignments target the tenant user identity linked to the
appropriate Core record, rather than requiring every user to be an employee.
Employee administration may be an entry point; authorized client and vendor
users use the same authorization model.

Applicable scope choices are self, selected companies, selected projects, all
companies, all projects, all projects within selected companies, and the entire
tenant. Each resource's owning design defines which scopes apply and what self
means. All scope selections remain within one tenant.

"All" includes existing and future matching records automatically. Selected
scope includes only the explicitly selected records. Company scope grants
applicable company-resource access; all-projects-within-companies is an explicit
project scope choice. Selecting a company is not an implicit grant to every
kind of resource associated with it.

Users may receive project assignments across companies without company-wide
assignments. Project access grants no general company-resource access; any
limited parent-company information necessary to use a project must be defined
by the owning resource contract.

### RBAC-003 — Additive access without scope expansion

An action is permitted when an applicable assignment grants it for the target
resource, subject to RBAC-005. Missing grants do not cancel another assignment's
grant. This design has no configurable role-level deny permissions.

Each capability retains the scope of the assignment that supplies it. The
service must not combine an action from one assignment with a broader scope
from another. Adding a project assignment neither narrows nor expands the
access supplied by an existing company assignment.

| Assignments                                           | Effective access                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Project Viewer on all projects; Project Editor on A1  | View all projects; edit only A1.                                                                |
| Project Manager on A1; Project Viewer on B1           | Manager capabilities on A1; viewer capabilities on B1.                                          |
| A/P Clerk in Companies A and B; Project Manager on C1 | The accounting capabilities in A and B remain unchanged; project capabilities apply only to C1. |
| Executive on all companies and projects               | Only the Executive role's capabilities and field grants, including for future matching records. |

Removing access requires removing every applicable grant supplying it.

### RBAC-004 — Sensitive-field grants

Role sets grant access to named sensitive-field groups, such as pricing, costs,
or profitability. View and edit grants are distinct where editing is meaningful.
A field grant does not independently grant access to a record or an operation.

Field grants are positive and additive within their assignment scopes. A role
without profitability access does not cancel another applicable role's grant;
a grant on Project A does not expose profitability on Project B. Record/action
authorization and field authorization must each apply to the requested resource.

Enforcement covers API reads and writes, exports, reports, and the web client.
Hiding a field in a form is insufficient. Owning resource contracts must also
address derived values, filters, sorting, and aggregates that could reveal
protected information. This PRD does not introduce an arbitrary per-column
policy editor or define every future module's sensitive-field groups.

### RBAC-005 — Independent access gates and business rules

Role grants operate within the existing server-owned entitlement, session,
tenant, resource, and controlled-administration boundaries cited above. They
cannot enable an unavailable module or bypass a tenant suspension.

Workflow invariants remain enforced by their owning modules. For example,
permission to edit an invoice does not permit editing a posted invoice, and
multiple roles cannot bypass an applicable prohibition on self-approval.
Configurable record-state visibility is outside this draft unless a concrete
business requirement establishes it.

Authorization remains PostgreSQL-backed under ARCH-023 and ARCH-029. Role,
assignment, and field-grant revocations affect subsequent requests; stale client
state cannot retain access. Cache acceleration remains a later capability.

### RBAC-006 — Permanent built-in roles

The following names describe the proposed target design, not current behavior.
Their identities cannot be renamed or deleted.

| Role             | Target authority                                                                                                                                          | Grant mutability                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `platform_admin` | All platform and tenant application capabilities, including controlled access across tenants.                                                             | Fixed full authority.                               |
| `tenant_admin`   | All tenant administration and business capabilities, including field access, within its tenant and enabled modules. No central or cross-tenant authority. | Fixed full tenant authority.                        |
| `support`        | Initially platform administration, including cell management and authorized administration reports; no tenant-business access by default.                 | Only platform administrators may change its grants. |

Permanent role identity is distinct from assignment of that role to a person.
The protected root identity retains its existing protections until an adopted
replacement explicitly reconciles them.

Full authority means application capabilities, not direct database credentials,
disclosure of stored secrets, bypass of isolation, or mutation of immutable
history. Privileged tenant operations retain controlled targeting and audit.

Support's platform access is expressed through authorized functions and reports,
not blanket exposure of every admin-table column. Tenant-business exceptions
must be explicitly granted by a platform administrator and use the controlled
access path. Support cannot change its own grants or use its operational
permissions to obtain grant-management authority. Adjusting grants to existing
capabilities requires no migration; new capabilities may require application code.

### RBAC-007 — Mutable business roles and seed boundary

NAP supplies templates for expected responsibilities, such as Project Manager,
Site Manager, Controller, A/P Clerk, and Sales. These names illustrate template
categories; individual business capabilities remain defined by their owners.
An Executive role may cover all companies and projects while granting only
selected viewing capabilities and sensitive information, without setup or
schedule-editing permissions.

An idempotent seed script creates tenant-owned editable roles from templates.
Role definitions are seeded outside migrations; migrations own their storage
structure. Repeated seeding preserves tenant customizations and does not
duplicate roles or silently regrant removed privileges. Template updates are
applied deliberately, not as automatic permission changes to existing roles.

### RBAC-008 — Administration, explanation, and audit

Authorized administrators can create and edit business roles, manage capability
and field grants, and assign roles to tenant users with explicit scopes.
Platform grants are administered separately from tenant business roles.

Assignment controls offer All or Selected for applicable resource types, with
record pickers and an explicit all-projects-within-selected-companies choice.
The interface explains that All includes future records. It never interprets
an empty selection as full access or silently applies every role to every
company associated with the user.

An effective-access view explains the capabilities, field grants, and scope
supplied by each assignment, including other assignments that would retain
access after a revocation. For example: "Maria can edit this project through
Project Manager, assigned to Project A."

Role, grant, and assignment changes are authorized and audited, with actor,
target, and the change recorded. The API enforces the same restrictions as the
administration screens, including permanent-role protection and support's
inability to manage grants. Tenant administrators cannot assign central roles.

## Acceptance

| Scenario                                                          | Required result                                                                                                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Different roles on projects in different companies                | Each role applies only within its assigned scope; company-wide membership is not required for project assignments.                                  |
| Broad viewing plus narrow editing                                 | Reading all projects and editing A1 never permits editing another project.                                                                          |
| Existing company assignment plus a new project assignment         | Company access remains unchanged; the project assignment adds only its own scoped grants.                                                           |
| Executive assigned to all companies and projects                  | Existing and future records are covered, but setup and schedule edits remain denied without those capabilities.                                     |
| Selected scope and empty selection                                | Unselected records remain inaccessible; an empty selection never means All.                                                                         |
| Multiple field grants                                             | An applicable grant allows the field; an absent grant does not deny it, and grants never cross scope boundaries.                                    |
| Protected fields through alternate surfaces                       | API reads/writes, exports, reports, and revealing derived/query operations enforce the resource's field policy.                                     |
| Revoked role, assignment, or field grant                          | Subsequent requests lose that grant; unrelated valid assignments continue to apply.                                                                 |
| Disabled entitlement, suspended tenant, or invalid workflow state | Roles cannot override the independent refusal.                                                                                                      |
| Support default and explicit exception                            | Platform operations are available as granted; tenant-business access is denied until explicitly authorized and then remains controlled and audited. |
| Built-in role and grant administration                            | Permanent roles cannot be renamed/deleted; fixed grants cannot be edited; support cannot change its own grants.                                     |
| Seed replay and template update                                   | No duplicate roles, overwritten customizations, restored revoked privileges, or silent permission changes.                                          |
| Isolation and audit                                               | Cross-tenant scope selections are rejected; authorization changes and controlled access retain required audit attribution.                          |

## Adoption before acceptance

1. Amend the specification explicitly for the proposed `platform_admin` naming
   and platform/support authority changes, retaining controlled access and
   isolation requirements.
2. Record a new ADR that identifies the portions of ADRs 0004 and 0006 it
   supersedes. Preserve their historical rationale and add supersession links.
3. Reconcile PRD 0004's `package_admin` vocabulary, root behavior, per-operator
   grant contract, and narrower support policy with RBAC-006. Reconcile PRD
   0005's initial access boundary and affected authentication contracts. Define
   existing-user/grant transition behavior without silently broadening access.
4. Complete the component data and API contracts needed for implementation,
   including grant administration, role assignment, effective-access queries,
   and applicable resource-scope/field definitions. Detailed module-entitlement
   design, business workflows, and executable SQL remain in their owning work.
5. Follow the documentation change workflow: accepted changes to existing
   behavior land with their implementation, or receive linked implementation
   issues and roadmap tracking when code is deliberately delayed. Prepare the
   capability implementation plan when implementation begins.

Until those steps are complete, this draft and its roadmap link record proposed
behavior only. They do not mark existing platform-role behavior as changed or
RBAC as implemented.

## Revisions

| Date       | Change                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-09 | Drafted the owner-agreed capability, scoped-assignment, field-grant, built-in-role, and template-seeding direction; recorded adoption requirements. |
