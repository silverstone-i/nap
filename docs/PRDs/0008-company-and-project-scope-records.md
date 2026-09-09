# 0008 — Company and project scope records

**Design:** Accepted (owner implementation authorization, 2026-09-09).
**Implementation:** Verified upon merge of [PR #18](https://github.com/silverstone-i/nap/pull/18) with required checks passing.

[CI on the reviewed implementation](https://github.com/silverstone-i/nap/actions/runs/34385270254) passed. Required CI must also pass on the final PR head.

## Authority

ARCH-006, ARCH-013–ARCH-020, ARCH-041, ARCH-047, ARCH-050; ADR 0008.

## Requirements and contracts

- **SCP-001:** Core owns companies: id, tenant_id, unique live code, name and
  standard tenant audit/soft-delete fields. Projects owns projects with the same
  fields plus immutable company_id referencing a same-tenant company.
- **SCP-002:** Factory routes at /api/core/v1/companies and
  /api/projects/v1/projects provide list/read/create/update/archive. Company
  reassignment is refused. Archived companies cannot receive new projects.
- **SCP-003:** Capabilities and scope apply before reads/counts/writes. Creation
  requires all/tenant scope for the new resource, or an applicable company_projects
  scope for a project. Selected projects cannot authorize creation of a new ID.
- **SCP-004:** Screens provide lists and simple creation/edit/archive forms;
  no scheduling, accounting or project lifecycle features are introduced.
  Scope-selection catalogs are restricted to tenant administrators. Project-only
  users receive company_id with the project, not unrestricted company records.
  `GET /api/projects/v1/projects/company-options` supplies only id/code/name
  for active companies within the caller's project-create scopes. Its registered
  company-options capability and project-create authority are both required;
  this reference selector does not grant company-wide access.

## Acceptance

Prove multiple companies and projects, immutable company ownership, valid same-
tenant foreign keys, all/future access, independent company/project assignments,
negative cross-tenant reads/writes, and real browser CRUD and denied states.

## Revisions

| Date       | Change                                            |
| ---------- | ------------------------------------------------- |
| 2026-09-09 | Accepted minimal scope records for RBAC delivery. |

| 2026-09-09 | Reconciled verification for PR #18; effective upon merge with required checks passing. |
