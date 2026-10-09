# I0009: Session Management

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                  |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                                                  |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md), [BFF](../../architecture/bff.md)                                                                                                                                                                                                                                                                                                 |
| Related PRDs         | [M0001-04: Session Management](../modules/M0001-admin-tenancy/M0001-04-session-management.md), [I0001: Application Entry and Shell](I0001-application-entry-and-shell.md), [I0002: Platform Administration Screens](I0002-platform-administration-screens.md), [I0005: RBAC Decision Model](I0005-rbac-decision-model.md), [M0003: Access Control](../modules/M0003-access-control.md) |
| Related decisions    | Active and ended sessions share one screen. Failed sign-ins stay in the event store and logs only. Same-browser tabs reset without polling or a server push.                                                                                                                                                                                                                           |
| Last reviewed        | 2026-10-09                                                                                                                                                                                                                                                                                                                                                                             |

## 2. Purpose

Napsoft operators need to see who is signed in, where, and since when, and to
end a session on demand. The same list, filtered to ended sessions, is the
sign-in history of every portal user. When a session ends in one browser tab,
every other tab of that browser must leave the app at once instead of showing
stale screens until its next request.

## 3. Scope

### Included

- A list of sessions, active and ended, for every portal user, filterable by
  user, tenant, date range, and status.
- A Napsoft Sessions screen showing that list, with Revoke for one or many
  active sessions.
- Resetting every tab of a browser to the sign-in page when that browser's
  session ends.

### Excluded

- Failed sign-in attempts. They remain `auth.login.failed` and
  `auth.login.throttled` events (M0001-03) and log entries.
- Sign-ins with an unknown email.
- Tenant-side session views. A tenant user sees only their own session.
- Purging old session rows (M0001-04 §9 keeps them).
- Ending a session's other tabs on a different browser or device before
  their next request. M0001-04-R004 already rejects that request.

## 4. Actors And Permissions

| Context                               | Actor                         | Required capability                    | Required state              | Result                  |
| ------------------------------------- | ----------------------------- | -------------------------------------- | --------------------------- | ----------------------- |
| List sessions                         | Napsoft operator              | `NAP::admin-tenancy::sessions::read`   | Any                         | Session list            |
| Revoke one or more sessions           | Napsoft operator              | `NAP::admin-tenancy::sessions::revoke` | Each target active or ended | Targets revoked         |
| Reset other tabs when a session ends  | Any signed-in user            | —                                      | Same browser, same session  | Every tab shows sign-in |
| List or revoke without the capability | Caller without the capability | —                                      | Any                         | `403 FORBIDDEN`         |

`platform_admin` holds both capabilities through `NAP::*::*::*`. `support`
holds `*::*::*::read`, and tenant `*` never covers Napsoft (M0003), so it
cannot list sessions.

## 5. Concepts And Terminology

| Term           | Meaning                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Session        | An `admin.sessions` row: one successful sign-in by one portal user (M0001-04-R001)                                     |
| Active session | A session that is not archived and whose idle and absolute expiry are both in the future                               |
| Ended session  | A session that is archived (revoked, logged out, or expired on resolution) or whose idle or absolute expiry has passed |
| Ended at       | The archive time, or for an unarchived session past expiry, the earlier of its idle and absolute expiry                |
| Same browser   | Every tab of one browser profile that shares the session cookie                                                        |

## 6. Functional Requirements

### Session list

- I0009-R001: `GET /api/admin-tenancy/v1/sessions` must return sessions of
  every portal user, newest sign-in first, as cursor pages
  (`{ rows, nextCursor }`, `cursor` and `limit` 1–100, default 50), the
  shape I0002 established.
- I0009-R002: The list must accept these filters, combined with AND:
  - `userId`: one portal user;
  - `email`: a case-insensitive substring of the portal user's email;
  - `tenantId`: the session's selected tenant;
  - `from` and `to`: ISO 8601 date-times with an offset; a session matches
    when it started at or after `from` and at or before `to`. The screen
    sends the start of the first chosen day and the end of the last in the
    browser's time zone;
  - `status`: `active` or `ended` (§5).
- I0009-R003: Each row must contain the session ID, portal user ID and
  email, selected tenant ID, code, and name (null when none is selected),
  started at, last seen at, status, and ended at (null while active). Rows
  never contain the token or token hash (M0001-04-R008).
- I0009-R004: The route must require `NAP::admin-tenancy::sessions::read`.
  The admin-tenancy descriptor must declare `admin-tenancy::sessions::read`
  so the I0005 startup check accepts the route.

### Sessions screen

- I0009-R005: Tenant Management must have a **Sessions** screen, shown only
  when the session holds `NAP::admin-tenancy::sessions::read` (I0002-R010).
- I0009-R006: The screen must be a standard grid (I0001-R015–R017) with
  columns User, Tenant, Started, Last seen, Status, and Ended. It must
  default to status Active and offer filters for user email, tenant, date
  range, and status.
- I0009-R007: An active row's action menu must offer **Revoke** when the
  session holds `NAP::admin-tenancy::sessions::revoke`. Ended rows have no
  Revoke. Revoke asks for confirmation with the text "This user is signed
  out of this session."
- I0009-R008: Selecting rows on the current page must enable **Revoke
  selected**, which revokes them through R009 after one confirmation naming
  the count.

### Revoking

- I0009-R009: `POST /api/admin-tenancy/v1/sessions/revoke` with
  `{ ids: [uuid, …] }` (1–100 IDs) must revoke every listed session in one
  admin transaction, applying M0001-04's revocation to each. It is
  all-or-nothing: if any ID is unknown, or names another user's session
  outside the caller's scope, nothing is revoked and the response is
  `403 FORBIDDEN`, the same answer `DELETE /sessions/:id` gives for an
  unknown or denied ID, so the route cannot reveal which session IDs exist. A session
  that has already ended is not a failure (M0001-04: repeated revocation
  succeeds).
- I0009-R010: The bulk route must require
  `NAP::admin-tenancy::sessions::revoke` and follow BFF browser request
  protection (M0001-04-R009).
- I0009-R011: When the caller's own session is among the revoked, the
  response must clear the session cookie, as `DELETE /sessions/:id` does for
  self-revocation.
- I0009-R012: After a revoke, the screen must refresh the current page. When
  the caller revoked their own session, R013 applies.

### Same-browser reset

- I0009-R013: When a tab learns its session has ended, every other open tab
  of the same browser must go to `/login` and clear its session state
  without a request to the server and without polling. A tab learns the
  session ended when:
  - the user logs out;
  - the user revokes their own session (R011 or `DELETE /sessions/:id`);
  - a request returns `UNAUTHENTICATED` mid-use.
- I0009-R014: A tab reset by R013 must remember its location as the return
  path, the same as a mid-use expiry (I0001), so signing in again returns
  there.

## 7. Business Rules And Invariants

- Status and ended at are derived when the list is read; no session column
  is added.
- The bulk revoke never revokes a subset (R009).
- Revoking from another browser or device affects that browser at its next
  request (M0001-04-R004); R013 covers only the browser that learned of it.

## 8. Lifecycle And State Transitions

| Status   | Event                                                                | Next status |
| -------- | -------------------------------------------------------------------- | ----------- |
| `active` | Revoke (single or bulk), logout, account disable, membership removal | `ended`     |
| `active` | Idle or absolute expiry passes                                       | `ended`     |
| `ended`  | Revoke                                                               | `ended`     |

## 9. Data Requirements

No schema change. The list reads `admin.sessions` with its archived rows,
joined to `admin.portal_users` for the email and `admin.tenants` for the
selected tenant. Revocation writes `admin.sessions` as M0001-04 does.

## 10. API Requirements

Admin Tenancy, base `/api/admin-tenancy/v1`:

| Method and route        | Capability                             | Query or body                                                            | Result                 | Errors                            |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------ | ---------------------- | --------------------------------- |
| `GET /sessions`         | `NAP::admin-tenancy::sessions::read`   | `cursor`, `limit`, `userId`, `email`, `tenantId`, `from`, `to`, `status` | `{ rows, nextCursor }` | `400 INVALID_INPUT`, `401`, `403` |
| `POST /sessions/revoke` | `NAP::admin-tenancy::sessions::revoke` | `{ ids }`, 1–100 UUIDs                                                   | `204`                  | `400 INVALID_INPUT`, `401`, `403` |

`GET /sessions` responds with `Cache-Control: no-store`. The existing
`DELETE /sessions/:id` is unchanged.

## 11. Cross-Module Interactions

- M0001-04 owns sessions and revocation; this PRD adds the list and the
  bulk route beside them.
- I0005 checks both capabilities; the descriptor change in R004 adds the
  read capability to its catalogue.
- I0001 owns the shell, mid-use expiry, and return path; R013 and R014 extend
  them to other tabs.
- I0002 supplies the cursor-page shape, the pagination adapter, and the
  Tenant Management visibility rule.

## 12. Security And Audit

- Each revoked session writes M0001-04's revocation event with the actor's
  ID and the session UUID. A bulk revoke writes one event per session.
- The list never exposes tokens or token hashes (M0001-04-R008).
- The same-browser signal carries no session data; it says only that the
  session ended.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                   | Requirements           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC01      | A Napsoft operator lists sessions across users, newest first, and filtering by user email, tenant, date range, and status returns only matching rows.                             | I0009-R001–R003, R006  |
| AC02      | A session past its expiry that was never resolved again lists as ended, with ended at set to its expiry.                                                                          | I0009-R003, §5         |
| AC03      | `support` and tenant users get `403` from both routes, and the Sessions screen is hidden from them.                                                                               | I0009-R004, R005, R010 |
| AC04      | Revoke on an active row ends it after confirmation; ended rows offer no Revoke; the user is rejected at their next request.                                                       | I0009-R007, R012       |
| AC05      | Revoke selected ends every selected session; with one unknown ID in the request, none is revoked and the response is `403 FORBIDDEN`.                                             | I0009-R008, R009       |
| AC06      | Revoking one's own session through either route clears the cookie and returns every tab of that browser to `/login`.                                                              | I0009-R011, R013       |
| AC07      | Logging out in one tab returns every other tab of the browser to `/login` with no further network request; signing in again in a reset tab returns it to its remembered location. | I0009-R013, R014       |
| AC08      | No response, log, event, or same-browser message contains a session token or token hash.                                                                                          | I0009 §12              |

## 14. Outstanding Questions

None.
