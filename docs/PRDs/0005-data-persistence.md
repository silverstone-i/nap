# PRD 0005 — Data persistence

- **Status:** Approved
- **Date:** 2026-08-07
- **Related:** [ADR-0013](../ADRs/0013-standard-resource-routes.md),
  [ADR-0014](../ADRs/0014-session-tokens-and-lifetimes.md),
  [ADR-0016](../ADRs/0016-continuous-data-persistence.md),
  [RULES/api-standard-routes.md](../RULES/api-standard-routes.md)

## Overview

Data persistence is a component of the Core module: the platform-wide
contract for when user-entered data is saved. Data is saved
continuously as it is entered — there is no Save button and no
unsaved work (ADR-0016). The component defines no tables and no
router of its own; its rules amend the standard `update` route
contract (owned by the standard-route factory in
`apps/api/src/framework/`, ADR-0013) and bind every resource router
and every client editing surface.

## Users and scenarios

- **Estimator** — enters a budget line by line; each field is stored
  as entered, and a browser crash loses at most the field being
  typed.
- **Field supervisor** — records timesheets in the field; closing the
  laptop mid-entry loses nothing already typed.
- **Any portal user** — is idle-logged-out (PRD
  [0004](0004-authentication-and-session-management.md)) with
  everything they entered already saved.
- **Two employees on one document** — the second writer of a field is
  refused with a conflict and shown the first writer's value at the
  moment they save, not at a submit minutes later.
- **Approver** — trusts that a `submitted` document passed its
  completeness rules at submission, even though it was stored
  incomplete for hours before that.

## API

No new endpoints. Two amendments to the standard `update` and
`bulk-update` routes ([RULES/api-standard-routes.md](../RULES/api-standard-routes.md)),
both from [ADR-0016](../ADRs/0016-continuous-data-persistence.md):

| Route               | Amendment                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| update, bulk-update | The body may be a partial row; only supplied columns are written.                                                            |
| update, bulk-update | The body carries the `updated_at` the client last read; a mismatch refuses the write with a conflict response and no change. |

## Business rules

### Saving

- The client saves a field on blur and, during sustained editing, at
  most once per 2 seconds per field, through the standard `update`
  route. No editing surface has a Save button.
- A record is created explicitly via `create`, in the router's
  initial status; every subsequent edit is an autosave write.
- Autosave writes demand `update` level like any update
  ([PRD 0003](0003-role-based-access-control.md)); scope and status
  predicates apply to every write.

### Validation

- Column-level validity (type, length, constraints) is enforced on
  every write; a column-invalid value is refused and the client keeps
  it visibly unsaved.
- Cross-field and completeness rules are enforced only at status
  transitions (`submit`, `approve`, and similar actions). A row in a
  pre-submission status may be incomplete but never column-invalid.
- A router whose documents carry completeness rules defines a
  pre-submission status for stored-but-not-submittable rows.

### Concurrency and audit

- Concurrency is optimistic: a write carrying a stale `updated_at` is
  refused with a conflict; the client refetches and surfaces the
  other writer's change rather than silently dropping either value.
- Audit granularity is the write: standard audit columns record each
  patch; no keystroke history is stored.

### Sessions

- Persistence traffic is not session activity and never extends a
  session (ADR-0014, [PRD 0004](0004-authentication-and-session-management.md)).

## Open questions

- Offline entry — whether field-heavy surfaces (timesheets, daily
  logs) need a client-side queue for disconnected use, which
  reintroduces the buffered-unsaved-work problem ADR-0016 rejects for
  the connected case.
- Conflict experience — what the client shows on a refused write:
  refetch-and-notify at minimum; a side-by-side merge view is
  undecided.
- Whether the 2-second cadence belongs in a web RULES doc as a shared
  client constant once the first editing surface lands.

## Out of scope

Session lifetimes and activity
([PRD 0004](0004-authentication-and-session-management.md)); who may
write ([PRD 0003](0003-role-based-access-control.md)); each router's
status vocabulary and completeness rules (the owning business-module
PRDs); the standard-route factory itself
([ADR-0013](../ADRs/0013-standard-resource-routes.md) and
[RULES/api-standard-routes.md](../RULES/api-standard-routes.md)).

## Success criteria

- An update supplying a subset of columns changes exactly those
  columns.
- An update carrying a stale `updated_at` is refused and changes
  nothing; the same body with the fresh `updated_at` succeeds.
- A column-invalid value is refused on write; an incomplete but
  column-valid row is stored in its pre-submission status; `submit`
  on that row is refused until its completeness rules pass.
- Ending the session mid-entry (crash, logout, idle expiry) loses at
  most the single field within its 2-second debounce window.
- A sustained autosave stream with no user input does not extend the
  session (shared criterion with PRD 0004).
- Each write records its actor and time in the standard audit
  columns, and no intermediate keystroke states are stored anywhere.

## Revisions

- 2026-08-07 — Initial version.
