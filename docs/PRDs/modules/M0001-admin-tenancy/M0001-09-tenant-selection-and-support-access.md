# M0001-09: Tenant Selection and Support Access

## 1. Document Control

| Field                | Value                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                  |
| Type                 | Module Work Unit                                                                             |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                            |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md), [BFF](../../../architecture/bff.md) |
| Related PRDs         | [M0001-04](M0001-04-session-management.md), [M0001-05](M0001-05-authorization.md)            |
| Related decisions    | Support has full platform access except access to or action on Napsoft tenant data           |
| Last reviewed        | 2026-09-21                                                                                   |

## 2. Purpose

Select a tenant for normal work and create controlled, attributed platform
operator access to tenant context.

## 3. Scope

### Included

- Listing and selecting eligible memberships.
- Entering and exiting support context.
- Optional effective-user attribution during support access.

### Excluded

- Session creation and base expiry.
- Opening the cell transaction.
- Cell-side permission evaluation.

## 4. Actors And Permissions

| Actor                         | Target                           | Result                             |
| ----------------------------- | -------------------------------- | ---------------------------------- |
| Portal user                   | Own active, ready membership     | Select tenant                      |
| Root user or `platform_admin` | Any active, ready tenant         | Enter support context              |
| `support`                     | Active, ready non-Napsoft tenant | Enter support context              |
| `support`                     | Napsoft tenant                   | Deny without returning tenant data |

## 5. Concepts And Terminology

| Term            | Meaning                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| Selected tenant | Tenant stored in the session for later routing                                               |
| Support context | Time-limited platform access attributed to the real operator                                 |
| Effective user  | Optional tenant member whose authorization context is used while retaining the real operator |

## 6. Functional Requirements

- M0001-09-R001: Normal selection must validate the current user's active, ready membership and the tenant's routing eligibility before changing the session.
- M0001-09-R002: Failed selection must leave the existing session unchanged.
- M0001-09-R003: Support entry must require `admin-tenancy::access::support`, a target tenant, and a reason; support-role entry must reject the Napsoft tenant.
- M0001-09-R004: Support context must retain the real actor, tenant, optional effective user, reason, and expiry.
- M0001-09-R005: Exit must remove support context, return to a platform session, and rotate the session token.

## 7. Business Rules And Invariants

- M0001-09-R006: The API resolves the cell from the tenant record; callers never supply a database or connection.
- M0001-09-R007: Central selection does not claim that a cell transaction opened or that cell-side authorization passed.

Normal selection requires an active, ready membership; an active, provisioned,
RBAC-ready tenant; an assigned enabled cell; and runtime readiness. An unavailable
runtime cell returns `503 CELL_UNAVAILABLE` without changing the session.

Support access lasts at most 60 minutes and cannot outlive the session. Reason
is trimmed and contains 10–512 characters. An effective user, when supplied,
must be active and have an active, ready membership in the target tenant.
Support contexts cannot nest or switch tenants; exit first.

## 8. Lifecycle And State Transitions

| State               | Action                         | Result                                         |
| ------------------- | ------------------------------ | ---------------------------------------------- |
| Platform session    | Select own tenant              | Normal tenant session and rotated token        |
| Platform session    | Enter support                  | Time-limited support session and rotated token |
| Tenant session      | Select another eligible tenant | New normal tenant session and rotated token    |
| Support session     | Enter or select                | Reject; exit first                             |
| Support session     | Exit or access expiry          | Platform session and rotated token             |
| Eligibility removed | Resolve                        | Revoke the affected session                    |

## 9. Data Requirements

This Work Unit reads tenants, memberships, platform roles, and cells and updates
`admin.sessions`. M0001-00 defines all schema fields.

## 10. API Requirements

| Method and route                              | Request                              | Result                                     |
| --------------------------------------------- | ------------------------------------ | ------------------------------------------ |
| `GET /api/admin-tenancy/v1/access/tenants`    | Current session                      | Eligible tenant views                      |
| `POST /api/admin-tenancy/v1/access/select`    | `{ tenant }`                         | Selected tenant context and rotated cookie |
| `POST /api/admin-tenancy/v1/access/support`   | `{ tenant, reason, effectiveUser? }` | Support context and rotated cookie         |
| `DELETE /api/admin-tenancy/v1/access/support` | Current support session              | Platform context and rotated cookie        |

Invalid input returns `400`; missing records `404`; ineligible membership or
authority `403`; invalid transitions `409`; unavailable cell `503`.

## 11. Cross-Module Interactions

M0001-04 owns token handling. Runtime routing uses the resolved cell UUID. The
receiving cell rechecks tenant availability, entitlements, and effective-user
permissions before beginning work.

## 12. Security And Audit

Entry, denial, exit, expiry, and every action performed in support context retain
the real operator. Events also record tenant, effective user, reason, session,
outcome, and request ID without session credentials.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                     | Requirements                 |
| --------- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Only eligible memberships and tenants can be selected; failure preserves the session.               | M0001-09-R001, M0001-09-R002 |
| AC02      | Browser-supplied database or cell values cannot influence routing.                                  | M0001-09-R006                |
| AC03      | Support entry enforces capability, reason, duration, effective-user checks, and the Napsoft denial. | M0001-09-R003, M0001-09-R004 |
| AC04      | Entry and exit rotate the token, prevent nesting, and preserve real-actor attribution.              | M0001-09-R004, M0001-09-R005 |
| AC05      | Central success never reports cell-side authorization success.                                      | M0001-09-R007                |

### Verification Evidence

This Work Unit shipped in [#15](https://github.com/silverstone-i/nap/pull/15)
("Add tenant selection and support access") without this PRD's status or
evidence being updated at the time; this section closes that gap against the
code and tests already merged, re-verified fresh rather than reconstructed
from the original PR.

Local validation on 2026-09-21: `npm run lint`, `npm run format:check`,
`npm test` (382 unit tests across the workspace, including 16 for this Work
Unit), `npm run build`, and `npm run licenses` passed.

`npm run test:db` passed all 158 tests against a disposable local PostgreSQL
18 server configured with real password authentication, including all 13
[tenant-access integration tests](../../../../apps/api/tests/integration/tenant-access.test.js).

Integration tests cover: listing only the caller's own active, ready
memberships in eligible tenants; selecting an eligible tenant, rotating the
session token and setting the tenant (AC01); refusing an ineligible
membership, an ineligible tenant, and an unavailable cell, in each case
leaving the session unchanged (AC01); reporting the cell unavailable purely
from the tenant record with no runtime collaborator wired up, even when the
cell is centrally enabled — demonstrating that no client-supplied database or
cell value can influence routing (AC02, AC05); refusing selection while
already in a support session, requiring exit first, and exactly one winner
among concurrent selections sharing a token (AC04); entering a time-limited
support context and exiting it against real constraints, and denial for a
caller with no support capability, with the denial itself recorded (AC03);
refusing exit from a session not in support mode; an expired support session
downgrading and rotating its token on the next read, with a concurrent reader
losing that race without erroring, and — as the negative case proving the
downgrade is real rather than unconditional — an ordinary read of a normal
session never rotating its token, and an unrelated explicit rotation left
undisturbed (AC04).

Unit tests cover: the narrow eligible-tenant view mapping; session and
capability gating over an in-memory admin handle for all four routes;
eligibility validation (membership, tenant, cell, and runtime readiness) and
its failure-leaves-session-unchanged guarantee (AC01); rejecting selection or
support entry while already in a support session; support capability denial;
granting root a time-limited, real-actor-attributed support context (AC03,
AC04); denying the Napsoft tenant "without exposing that it exists" once a
scope carries the restriction, matching R003's requirement precisely (AC03);
the reason field's 10–512 character bound; requiring an effective user to
exist with an active, ready membership in the target tenant (AC03); exit
clearing context and rotating the token, and its refusal from a normal
session (AC04); and the same expired-session downgrade-and-rotate path unit
tests already cover at the integration layer.

As every other Work Unit in this family documents, `authorization.js`
currently resolves only root or no platform authority (M0001-05's role-based
`platform_admin`/`support`/`tenant_admin` waits for the tenant-local role
catalogue in the cell). AC03's Napsoft-support denial (M0001-09-R003) is
therefore demonstrated today by hand-building a `support`-shaped, Napsoft-
restricted scope and calling the domain functions directly, rather than by a
distinguishable `support` session, which has no runtime path to authenticate
as yet — the same posture M0001-08's verification evidence documents.

## 14. Outstanding Questions

None.
