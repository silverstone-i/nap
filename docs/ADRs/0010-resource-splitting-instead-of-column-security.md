# 0010 — Resource splitting instead of column security

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

PRD 0003 separates audiences by field: project managers see cost but
never profit or revenue, the owner/controller sees both, and client and
vendor logins never see internal cost, markup, or margin data. The
obvious mechanism is field-level permissions. This ADR records the
decision not to build one.

## Decision

1. **There is no field-level permission mechanism.** No field groups,
   no per-column grants, no response-stripping middleware. The
   permission cell (ADR-0007) stays level × scope × statuses.
2. **Audience separation is resource granularity.** Where two
   audiences may see different columns of the same data, each audience
   gets its own view and router: `vw_project_cost` for PM-class roles,
   `vw_project_profitability` for the owner/controller. External users
   get dedicated routers whose queries select no internal columns.
3. **Income-revealing fields never appear on resources PM-class roles
   can read.** Contract value, invoiced totals, and any field revenue
   can be derived from live only on owner/controller resources. This
   is the design constraint resource splitting creates, and every
   future resource is bound by it.
4. **A router's rows are scoped at exactly one granularity.**
   Company-level and project-level documents never share a router. A
   user needing company-wide access to company documents plus specific
   projects holds cells on two routers, so a cell's single scope
   always fits and no compound scope exists.

## Consequences

- Adding an income field to a PM-readable resource is an access
  regression. No mechanism catches it; resource review does. Point 3
  is the rule reviewers hold the line on.
- More views and routers than a column-security design would need, and
  a `cell_catalog` entry (ADR-0011) per audience router.
- Point 4 splits by granularity as points 1–3 split by audience: a
  resource that would mix company-level and project-level rows becomes
  two routers instead of a compound scope in the permission model.
- What a grant exposes is exactly what its router's resource selects —
  readable in one place, with no group definitions to resolve.

## Alternatives considered

**Field groups granted per role.** Rejected. A second grant dimension
beside the cell reintroduces cross-dimension merging for multi-role
users — the synthesis ADR-0007 exists to prevent — and hides a grant's
real surface behind group definitions.

**Response-filtering middleware.** Rejected. Stripping columns after
the query scatters the security decision across serializers, is
invisible in the SQL, and fails open: one field missed in one filter
ships the data.
