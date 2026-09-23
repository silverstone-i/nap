# M0001-13: Support Access Consent

## 1. Document Control

| Field                | Value                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                         |
| Type                 | Module Work Unit                                                                                                                                                                              |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                             |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md)                                                                                                                                       |
| Related PRDs         | [M0001-04](M0001-04-session-management.md), [M0001-05](M0001-05-authorization.md), [M0001-09](M0001-09-tenant-selection-and-support-access.md), [M0001-12](M0001-12-administrative-events.md) |
| Related decisions    | Postponed until admin tenancy and cell tenancy run with RBAC; schema delivered in M0001-00                                                                                                    |
| Last reviewed        | 2026-09-22                                                                                                                                                                                    |

## 2. Purpose

Limit what platform staff can do inside a tenant. Support reads without consent,
acts as a tenant member only with that member's or a `tenant_admin`'s approval,
and `platform_admin` writes as itself only through an audited break-glass mode.

## 3. Scope

### Included

- Read-only support context when no effective user is named.
- Support-grant requests, decisions, expiry, and single use.
- Break-glass support context for `platform_admin` and the root user.
- In-app listing of pending requests for the member and the tenant's `tenant_admin` users.

### Excluded

- Email or push delivery of requests; M0001-13 uses in-app display only.
- Cell-side enforcement of read-only and write permissions, which uses the M0002
  tenant context and M0003 permission evaluation.
- Changes to normal tenant selection.

## 4. Actors And Permissions

| Context                      | Actor                         | Required permission                  | Required state                                        | Result                                        |
| ---------------------------- | ----------------------------- | ------------------------------------ | ----------------------------------------------------- | --------------------------------------------- |
| Enter without effective user | `support` or `platform_admin` | `admin-tenancy::access::support`     | Non-Napsoft tenant for `support`                      | Read-only support context                     |
| Request a grant              | `support` or `platform_admin` | `admin-tenancy::access::support`     | Target member active with an active, ready membership | Pending grant                                 |
| Decide a grant               | The named member              | Own pending grant                    | Grant pending and unexpired                           | Approved or denied                            |
| Decide a grant               | `tenant_admin` of the tenant  | `tenant_admin` in the grant's tenant | Grant pending and unexpired                           | Approved or denied, recorded as the decider   |
| Enter as effective user      | The grant's operator          | `admin-tenancy::access::support`     | Matching approved, unexpired, unused grant            | Support context with the member's permissions |
| Enter break-glass            | `platform_admin` or root      | `admin-tenancy::access::break-glass` | Reason includes a ticket reference                    | Write-capable break-glass context             |
| Cancel a grant               | The grant's operator          | Own pending or approved grant        | Grant not used                                        | Cancelled                                     |

## 5. Concepts And Terminology

| Term          | Meaning                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Support grant | A request by a support operator to act as one tenant member, and the decision on it                 |
| Decider       | The member named in the grant, or a `tenant_admin` of the same tenant acting on the member's behalf |
| Break-glass   | A support context with write access and no effective user, reserved for `platform_admin` and root   |

## 6. Functional Requirements

- M0001-13-R001: A support context without an effective user must permit reads only; cell-side writes must be rejected.
- M0001-13-R002: Entering support with an effective user must require an approved, unexpired, unused grant for the same operator, tenant, and member, and must mark it used with the new session.
- M0001-13-R003: A grant request must record tenant, operator, member, reason, and an expiry 24 hours after the request.
- M0001-13-R004: The member or any `tenant_admin` of the grant's tenant may approve or deny a pending, unexpired grant; the grant records the decider and decision time.
- M0001-13-R005: The member and the tenant's `tenant_admin` users must be able to list pending grants in the application.
- M0001-13-R006: Break-glass entry must require `admin-tenancy::access::break-glass`, a reason containing a ticket reference, and no effective user; it permits writes as the real operator.
- M0001-13-R007: Break-glass entry must be visible to the tenant's `tenant_admin` users after the fact.

## 7. Business Rules And Invariants

- Only one pending or approved grant exists per operator, tenant, and member.
- An operator cannot request a grant to act as themselves.
- A grant allows one support session; a new session needs a new grant.
- Grants and break-glass contexts keep M0001-09's 60-minute limit, reason rules,
  token rotation, and Napsoft restriction for `support`.
- `admin-tenancy::access::break-glass` joins M0001-05's `platform_admin`
  capability set when this Work Unit is implemented; `support` never receives it.

The database enforces the grant fields for each status, the one-open-grant rule,
and immutable request fields. The module domain enforces status transitions,
expiry, and decider authority.

## 8. Lifecycle And State Transitions

| State    | Action                                | Result    |
| -------- | ------------------------------------- | --------- |
| None     | Operator requests                     | Pending   |
| Pending  | Member or `tenant_admin` approves     | Approved  |
| Pending  | Member or `tenant_admin` denies       | Denied    |
| Pending  | 24 hours pass                         | Expired   |
| Approved | Operator enters support as the member | Used      |
| Approved | 24 hours after request pass unused    | Expired   |
| Pending  | Operator cancels                      | Cancelled |
| Approved | Operator cancels                      | Cancelled |

## 9. Data Requirements

`admin.support_grants` stores each grant; `admin.sessions.access_mode` gains
`break_glass`, which requires a tenant, reason, and expiry and forbids an
effective user. [M0001-00-01](M0001-00-01-admin-schema-objects.md) defines both.

## 10. API Requirements

| Method and route                                               | Purpose                           |
| -------------------------------------------------------------- | --------------------------------- |
| `POST /api/admin-tenancy/v1/access/support-grants`             | Request a grant                   |
| `GET /api/admin-tenancy/v1/access/support-grants/pending`      | List grants the caller may decide |
| `POST /api/admin-tenancy/v1/access/support-grants/:id/approve` | Approve a pending grant           |
| `POST /api/admin-tenancy/v1/access/support-grants/:id/deny`    | Deny a pending grant              |
| `DELETE /api/admin-tenancy/v1/access/support-grants/:id`       | Cancel the caller's own grant     |
| `POST /api/admin-tenancy/v1/access/break-glass`                | Enter break-glass context         |

`POST /access/support` with `effectiveUser` requires a matching grant (R002).
Invalid input returns `400`; unauthorized deciders `403`; missing grants `404`;
expired, used, or duplicate grants `409`.

## 11. Cross-Module Interactions

Cell-side enforcement of read-only support and member permissions depends on
the M0002 tenant context and M0003 permission evaluation. Cache and event
effects use M0001-11 and M0001-12.

## 12. Security And Audit

Events record grant requests, decisions, expiry, cancellation, use, and
break-glass entry and exit, with operator, tenant, member, decider, reason, and
session. The existing real-operator attribution rules from M0001-09 apply to
every action in support or break-glass context.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                           | Requirements                 |
| --------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Support without an effective user can read but not write tenant data.                                     | M0001-13-R001                |
| AC02      | Acting as a member fails without an approved, unexpired, unused grant and consumes the grant on success.  | M0001-13-R002                |
| AC03      | The member or a `tenant_admin` can decide a grant; others are refused; grants expire after 24 hours.      | M0001-13-R003, M0001-13-R004 |
| AC04      | Pending grants appear to the member and the tenant's `tenant_admin` users.                                | M0001-13-R005                |
| AC05      | Only `platform_admin` or root can enter break-glass; entries appear to the tenant's `tenant_admin` users. | M0001-13-R006, M0001-13-R007 |

## 14. Outstanding Questions

- How pending requests and break-glass notices reach users who are not signed in,
  if in-app display proves insufficient.
- The exact ticket-reference format required in a break-glass reason.
