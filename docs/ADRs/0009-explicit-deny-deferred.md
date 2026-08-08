# 0009 — Explicit deny deferred: deny is absence of a cell

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

Under any-cell-satisfies resolution (ADR-0008), the open question is
whether a grant can subtract access — a cell that vetoes what another
cell allows. v1 needs a rule either way.

## Decision

1. **In v1, deny is the absence of a cell.** A request that no cell
   satisfies is refused; nothing else refuses. No cell vetoes another.
2. **`level none` cells and veto semantics are deferred, not adopted.**
   Either one changes the resolution rule in ADR-0008, so adopting
   either later requires a new ADR.

## Consequences

- Role editing stays purely additive: granting a role can only widen
  access, never narrow it, so admins reason about roles one at a time.
- Exceptions cannot be carved out of a broad grant; narrower access is
  written as narrower cells. Roles are authored to the access they
  mean, not corrected afterwards by subtraction.
- Single-grant explainability (PRD 0003) survives: a refusal is "no
  cell satisfied," never an interaction between two cells.

## Alternatives considered

**`level none` cells.** Deferred. Under any-cell-satisfies, a `none`
cell is inert — some other cell still satisfies the request — so it
only means something as a veto, which is the next alternative.

**Veto semantics ("a deny cell overrides").** Deferred. A veto makes
role combination subtractive: assigning an extra role could remove
access, and a refusal would be explained by two cells instead of one.
That may yet earn its place for hard exclusions, but it changes the
resolution contract and belongs in its own ADR.
