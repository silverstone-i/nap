# 0016 — Continuous data persistence

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

The platform needs one answer to when user-entered data is saved:
on an explicit submit, or continuously as it is entered. The choice is
a server-contract decision, not a client one — a submit-shaped
application programming interface (API) cannot be made autosaving from
the client, while an autosave-capable API supports either cadence.
The choice also interacts with session policy: ADR-0014's idle logout
is only tolerable if it can never destroy unsaved work.

## Decision

1. **Continuous persistence is the platform default.** Clients save
   each field edit as it happens (debounced, or on blur) through the
   standard `update` route (ADR-0013); record editing has no Save
   button. A record is still created explicitly via `create`, in the
   router's initial status, and is edited continuously from then on.
2. **`update` accepts partial rows.** Only the supplied columns are
   written; the route's semantics are field-level patch, not
   whole-row replacement.
3. **Validation splits by kind.** Column-level validity (type, length,
   constraints) is enforced on every write. Cross-field and
   completeness rules are enforced at status transitions — the
   `submit`, `approve`, and similar custom actions (PRD 0003) — never
   on autosave writes. A row in its pre-submission status may be
   incomplete but never invalid column-by-column.
4. **Concurrency is optimistic.** An update carries the `updated_at`
   the client last read; a mismatch refuses the write with a conflict
   response and the client refetches. Last-write-wins across fields is
   not offered.
5. **Audit granularity is the write.** Standard audit columns record
   each patch; no keystroke journal exists. Client debouncing bounds
   the volume.
6. **Persistence traffic is not session activity.** Autosave writes
   never extend a session (ADR-0014); the two contracts are designed
   as a pair — sessions may idle out precisely because nothing is
   unsaved when they do.

## Consequences

- Role-based access control (RBAC) checks run per write, against the cached
  cell list (ADR-0012), so the added request volume prices in at a
  Redis lookup, not a Postgres query.
- Routers whose documents have completeness rules need a
  pre-submission status for rows that are stored but not yet
  submittable.
- The client owes a conflict experience: a refused write must surface
  the other user's change, not silently drop the field.
- An abandoned tab holds no unsaved work, so ADR-0014's idle logout
  loses nothing.
- Multi-user editing of one row surfaces conflicts at field-save time
  rather than at a final submit, when they are cheapest to resolve.

## Alternatives considered

**Submit-to-save.** Rejected. An idle logout, crash, or navigation
destroys everything since the last submit, and other users read stale
rows for the whole editing session. The pattern survives from
form-posting applications, not from a requirement.

**Client-side buffer with periodic bulk save.** Rejected. The buffer
is exactly the unsaved work continuous persistence exists to
eliminate, and batched writes turn one-field conflicts into
whole-batch conflicts.

**Per-keystroke event sourcing.** Rejected. Audit volume grows by
orders of magnitude to record intermediate states no reader needs;
the write-level audit trail already answers who changed what.
