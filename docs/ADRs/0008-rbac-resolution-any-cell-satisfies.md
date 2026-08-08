# 0008 — RBAC resolution: any cell satisfies, grants never merged

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

ADR-0007 fixed the grant shape — self-contained cells. This ADR records
how a request resolves against a user's cells, under PRD 0003's two
constraints: combining roles must never synthesize access no single
role grants, and every allow must be explainable by one grant.

## Decision

1. **A write is allowed iff at least one cell fully satisfies it.**
   The cell's level meets or exceeds the route's demand, the target row
   lies within the cell's scope, and the row's status is within the
   cell's statuses — all three in the same cell. Cells are evaluated
   whole; no components are combined across cells.
2. **A read is the union of what each qualifying cell admits.** Each
   cell meeting the level demand contributes the predicate
   `(scope-filter AND status-filter)`; the predicates are OR'd into one
   query. The result is the distinct union of rows each cell admits —
   `rows(cell₁) ∪ rows(cell₂)`, never `rows(merge(cell₁, cell₂))`.
3. **There is no precomputed flat permission map.** The cached
   artifact is the user's cell list (ADR-0012); resolution runs over
   the cells at request time.

## Consequences

- The multi-role guarantee holds by construction: every admitted row
  and every allowed write is admitted by some single cell, so no
  combination of roles reaches anything no role wrote.
- Explainability falls out for free — the satisfying cell (writes) or
  the admitting cell per row (reads) is the explanation.
- A read query grows one OR branch per qualifying cell. Users hold few
  roles and a role holds one cell per (router, action), so the branch
  count stays small.

## Alternatives considered

**Flat merged permission map per user.** Rejected. Merging is where
synthesis happens: any rule that folds cells into one effective grant
either loses information or combines components across cells. The map
is also a derived artifact — a second thing to invalidate whenever a
grant changes.

**Most-permissive-per-component resolution.** Rejected. Taking the
highest level and the widest scope across cells is precisely the
synthesis PRD 0003 forbids, in its simplest form.
