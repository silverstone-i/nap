# M0001-14: Session Device Identification

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Accepted                                                                                                                                                                                                                        |
| Type                 | Module Work Unit                                                                                                                                                                                                                |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                               |
| Related architecture | [BFF](../../../architecture/bff.md), [Migrations](../../../architecture/migrations.md)                                                                                                                                          |
| Related PRDs         | [M0001-04: Session management](M0001-04-session-management.md), [M0001-00-01: Admin schema objects](M0001-00-01-admin-schema-objects.md), [I0009: Session Management](../../inter-module-workflows/I0009-session-management.md) |
| Related decisions    | The browser label is parsed in the API with no third-party library. The raw header is stored so a better parser later relabels old sessions. Client IP addresses are not stored until a retention rule exists.                  |
| Last reviewed        | 2026-10-27                                                                                                                                                                                                                      |

## 2. Purpose

The Sessions screen cannot tell one session from another when the same user
is signed in more than once. Three sessions for one user show the same email
and tenant, with only start times to tell them apart, so an operator cannot
see which row is their own browser or which to revoke.

This Work Unit records the browser and operating system (OS) of each session
at sign-in and marks the caller's own session in the list.

It amends I0009-R003, I0009-R006, and I0009 §7 and §9, which state that no
session column is added.

## 3. Scope

### Included

- Storing the request's `User-Agent` header (the browser's self-description
  sent with every HTTP request) on each new session.
- A browser label, such as "Chrome on macOS", on each session list row.
- A Browser column on the Sessions screen, with a "This browser" marker on
  the caller's own session.

### Excluded

- Client IP address: personal data that needs a retention rule first.
- Naming or remembering devices: needs its own identity model, not a label.
- Adding the label to `session.created` events: the session ID already links
  an event to its row.
- Relabelling sessions created before this change: they have no stored header.

## 4. Actors And Permissions

| Actor                                          | Operation                  | Result                                    |
| ---------------------------------------------- | -------------------------- | ----------------------------------------- |
| Anonymous caller                               | Successful login           | Session stores the request's `User-Agent` |
| Holder of `NAP::admin-tenancy::sessions::read` | List sessions (I0009-R001) | Each row carries its browser label        |

No new capability. The list keeps I0009-R004's capability check.

## 5. Concepts And Terminology

| Term          | Meaning                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| User agent    | The raw `User-Agent` request header, as stored on the session                               |
| Browser label | "<Browser> on <OS>", derived from the user agent when the list is read                      |
| This browser  | The session whose ID matches the caller's own session, as returned by `GET /access/context` |

## 6. Functional Requirements

- M0001-14-R001: A successful login must store the request's `User-Agent` on the new session, trimmed and cut to 512 characters. A missing or blank header stores null.
- M0001-14-R002: Each session list row must carry `browser`: the browser label, or null when the session has no stored user agent. The raw user agent must never appear in an API response.
- M0001-14-R003: The browser label must name the browser and the OS as follows. Rules are checked in the order listed and the first match wins.

  | Part    | Rule (first match)                                                                                                                                                   | Otherwise         |
  | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
  | Browser | `Edg/`, `EdgA/`, or `EdgiOS/` → Edge; `OPR/` or `OPT/` → Opera; `Firefox/` or `FxiOS/` → Firefox; `Chrome/` or `CriOS/` → Chrome; `Safari/` with `Version/` → Safari | "Unknown browser" |
  | OS      | `iPhone` or `iPad` → iOS; `Android` → Android; `Windows` → Windows; `CrOS` → ChromeOS; `Mac OS X` or `Macintosh` → macOS; `Linux` → Linux                            | omitted           |

  With a known OS the label is "<Browser> on <OS>"; without one it is the browser alone. iPadOS Safari sends a macOS user agent with no `iPad` token, so its sessions are labelled macOS; the header cannot tell them apart.

- M0001-14-R004: The Sessions screen must show a Browser column after User. A row with a null browser shows "—".
- M0001-14-R005: The row for the caller's own session must show a green dot before its browser label, named "This browser" for screen readers and in a tooltip. No other row shows it.

## 7. Business Rules And Invariants

- M0001-14-R006: A session's user agent is written once, at creation. Token rotation, tenant selection, and password change keep it.
- The "This browser" marker is decided by the web app from its own session ID; the list response is the same for every caller.

## 8. Lifecycle And State Transitions

Not applicable: the user agent has no states. It is set at creation and
archived with its session.

## 9. Data Requirements

`admin.sessions` gains one nullable column, `user_agent text`, added in place in
baseline migration `001-admin-tenancy`. Sessions created before the change
keep null. The model's column list must end with the new column so
the catalog check in `verifyAdmin` matches.

## 10. API Requirements

`GET /api/admin-tenancy/v1/sessions` rows gain `browser` (string or null).
`POST /api/admin-tenancy/v1/auth/login` keeps its request and response
shapes; the server reads the header itself.

## 11. Cross-Module Interactions

Not applicable: the column lives in `admin.sessions`, and only Admin Tenancy
reads it.

## 12. Security And Audit

- M0001-14-R007: The stored user agent is caller-supplied text. It must be length-capped (R001) and leave the API only as the derived label.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                            | Requirements                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| AC01      | Login with a Chrome-on-macOS header stores the header; the list row shows `browser: "Chrome on macOS"`.                                                                                    | M0001-14-R001, M0001-14-R002 |
| AC02      | Login without a `User-Agent` stores null; the row shows `browser: null`.                                                                                                                   | M0001-14-R001, M0001-14-R002 |
| AC03      | A 600-character header is stored as its first 512 characters.                                                                                                                              | M0001-14-R001, M0001-14-R007 |
| AC04      | Real headers for Edge, Opera, Firefox, Chrome, and Safari on Windows, macOS, iOS, Android, ChromeOS, and Linux produce the labels in R003; an unrecognized header gives "Unknown browser". | M0001-14-R003                |
| AC05      | After token rotation, tenant selection, and password change, the session's stored user agent is unchanged.                                                                                 | M0001-14-R006                |
| AC06      | No list response contains a `user_agent` field or the raw header.                                                                                                                          | M0001-14-R002, M0001-14-R007 |
| AC07      | The Sessions screen shows a Browser column after User, "—" for a null browser, and the "This browser" dot on the caller's row only.                                                        | M0001-14-R004, M0001-14-R005 |
| AC08      | `verifyAdmin` passes after baseline migration `001-admin-tenancy`.                                                                                                                         | M0001-14-R001                |

## 14. Outstanding Questions

None.
