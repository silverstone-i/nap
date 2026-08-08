# 0007 — RBAC: self-contained permission cells

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

PRD 0003 requires role-based access control (RBAC) governed per
(module, router) with an access level, a data scope, and status
visibility, held by users who may carry several roles at once — and it
forbids role combination from synthesizing access no single role
grants. This ADR records the shape of a grant. How grants resolve at
request time is ADR-0008; the tables are ADR-0011.

## Decision

1. **A grant is one self-contained row — a cell.** A cell is
   `(module, router, action) → { level, scope, visible_statuses }`.
   Level, scope, and statuses live in the same row; nothing about a
   grant is stored anywhere else.
2. **`action = ''` is the router-wide cell.** A non-empty action (e.g.
   `approve`) overrides the router cell for that action only; every
   other route on the router keeps answering to the router cell.
3. **The cell is the unit of evaluation.** Enforcement reads cells
   whole and never decomposes one into components (ADR-0008).

## Consequences

- Everything a role can do is its cell list — one table answers every
  question about a role's power, and an allow decision is explained by
  naming one cell, which is PRD 0003's explainability requirement.
- Segregation of duties is expressible directly: `approve` is its own
  cell, so a `full` router cell grants no approval power.
- Because a cell is indivisible, the multi-role guarantee reduces to a
  resolution rule over whole cells, recorded in ADR-0008.

## Alternatives considered

**Independent permission layers (level, scope, status filters, field
groups), each merged across roles.** Rejected. Merging each layer
independently combines one role's level with another role's scope,
synthesizing permissions no single role wrote. A user holds a role
granting `update` on their assigned projects and a second role
granting `view` on all projects; per-layer merging hands them `update`
on all projects.

**Per-cell merging across roles (Dynamics-style security matrices).**
Rejected. Merging level and scope within one cell across roles
produces the same synthesis, merely contained to a single cell.

**Single role per user.** Rejected. It sidesteps merge semantics
today, but PRD 0003's actors overlap (a PM who is also an approver),
and retrofitting multi-role later would force either abandoning status
visibility or a semantic migration of every existing grant.
