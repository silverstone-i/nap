# M0001-03: Authentication

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Related architecture | [BFF](../../../architecture/bff.md), [Module design](../../../architecture/module-design.md)                                                                                                                                                                                                                                                                                                                                                                                           |
| Related PRDs         | [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md), [M0001-02: Root-User Provisioning](M0001-02-root-user-provisioning.md), [M0001-04: Session Management](M0001-04-session-management.md), [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 2. Purpose

Verify portal-user passwords, enforce required password changes, and throttle
failed logins using central admin data.

## 3. Scope

### Included

- Credential verification and required-password-change behavior.
- Authentication fields on portal users and persistent login-throttle records.
- Outcomes consumed by session management.

### Excluded

- Session tokens, rotation, tenant selection, and cell access.
- Login-screen behavior owned by C0001: Authentication.
- Unspecified recovery, invitation, or external identity-provider flows.

## 4. Actors And Permissions

| Context                        | Actor                  | Required state                                   | Result                                             |
| ------------------------------ | ---------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Attempt login                  | Unauthenticated person | Credentials supplied; throttle allows an attempt | Verify centrally                                   |
| Invalid credentials            | Login caller           | Verification fails                               | Deny authentication and apply throttle rules       |
| Password change required       | Verified portal user   | Required-change condition is set                 | Restrict ordinary access until the change succeeds |
| Change another user's password | Administrative caller  | Authority and reset flow undecided               | No grant established here                          |

Account eligibility and reset authority remain open in Q02 and Q05.

## 5. Concepts And Terminology

| Term                     | Meaning                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Credential verifier      | Stored password-derived value used to check a supplied password                             |
| Required password change | Condition that prevents ordinary authenticated use until a replacement password is accepted |
| Login throttle           | Persistent control that limits repeated failed verification attempts                        |

## 6. Functional Requirements

- M0001-03-R001: Authentication must verify a supplied password against the portal user's stored verifier and return a clear internal success or failure outcome.
- M0001-03-R002: A required-password-change condition must prevent ordinary authenticated access until a valid replacement password is stored.
- M0001-03-R003: Failed login attempts must update and enforce persistent throttle state under the agreed throttle rules.
- M0001-03-R004: A rejected credential attempt must not authorize creation of an ordinary authenticated session.

## 7. Business Rules And Invariants

- M0001-03-R005: Passwords must not be stored as plaintext; passwords and stored verifiers must not appear in identity responses, logs, or events.
- M0001-03-R006: A failed password replacement must leave the existing verifier and required-change condition consistent.

The algorithm, parameters, password rules, throttle key and timing, and update
transaction contract remain open in Q01–Q04.

## 8. Lifecycle And State Transitions

| Condition                  | Operation                                           | Result                                                |
| -------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Verification permitted     | Submit password                                     | Success, failure, or password-change-required outcome |
| Throttle prohibits attempt | Submit password                                     | Throttled outcome under Q03                           |
| Password change required   | Submit valid replacement through an authorized flow | Store replacement and clear the requirement           |
| Replacement fails          | Submit replacement                                  | Preserve the prior credential state                   |

State values, cooldown/reset rules, and the proof required for a password change
are specified by the decisions below.

## 9. Data Requirements

| Table                   | Fields whose meaning this unit owns                                                                   | Access and sensitivity                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `admin.portal_users`    | Password verifier and required-change condition; authentication eligibility fields agreed with unit 8 | Credential lookup and update; restricted secret-bearing data |
| `admin.login_throttles` | Throttle subject, failed-attempt state, and timing needed by the selected rules                       | Check/update at login; potentially identifying security data |

[M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md) owns portal-user identity and uniqueness. Hash format, timestamp fields,
throttle key constraints, cleanup, and retention remain open in Q01–Q03.

## 10. API Requirements

| Operation                 | Input                                            | Internal outcome                                                |
| ------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| Verify login              | Login identifier and password                    | Verified user, password change required, rejected, or throttled |
| Replace required password | Authorized change proof and replacement password | Changed or rejected                                             |

HTTP methods, routes, request schemas, status codes, public error disclosure,
and password-change proof are open in Q04. Verification retries can change
throttle state; this operation is not assumed to be idempotent. Credential
updates coordinate with unit 4 for session effects.

## 11. Cross-Module Interactions

- [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md) supplies central identities; [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md) owns ordinary account administration.
- [M0001-02: Root-User Provisioning](M0001-02-root-user-provisioning.md) supplies the initial root credential using this storage contract.
- [M0001-04: Session Management](M0001-04-session-management.md) consumes verification and restricted-access outcomes.

C0001: Authentication remains the planned application and UI contract and
references this PRD for admin verification. This work unit has no cell dependency.

## 12. Security And Audit

Login failures, throttle changes, and password changes are event-catalogue
subjects for [M0001-12: Administrative Events](M0001-12-administrative-events.md). [M0001-11: Cache Consistency](M0001-11-cache-consistency.md) covers cached credential eligibility. Password
change effects on existing sessions are shared with [M0001-04: Session Management](M0001-04-session-management.md) and remain open in
Q05. Public responses must satisfy M0001-03-R005; account-enumeration behavior is
an explicit Q04 decision.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                        | Requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01      | Valid and invalid passwords produce the agreed distinct internal outcomes using only admin data.                                                       | M0001-03-R001                                                                                                                                          |
| AC02      | A required-change user cannot gain ordinary access before a successful replacement.                                                                    | M0001-03-R002, M0001-03-R004                                                                                                                           |
| AC03      | Repeated failures, concurrent attempts, and throttle reset boundaries enforce the agreed throttle limits.                                              | M0001-03-R003                                                                                                                                          |
| AC04      | Failed verification cannot be used to issue an ordinary session.                                                                                       | M0001-03-R004                                                                                                                                          |
| AC05      | Storage and outputs contain no plaintext password; verifier values are restricted to credential operations.                                            | M0001-03-R005                                                                                                                                          |
| AC06      | A failed replacement preserves the previous verifier and required-change condition.                                                                    | M0001-03-R006                                                                                                                                          |
| AC07      | Applicable source mutations invalidate their cached decisions and record the required catalogue events; failures follow the accepted shared contracts. | [M0001-11-R002](M0001-11-cache-consistency.md#6-functional-requirements), [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

## 14. Open Questions

| ID  | Decision required before acceptance                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------- |
| Q01 | Which password algorithm, parameters, password rules, and verifier-upgrade behavior apply?                  |
| Q02 | Which portal-user states permit verification and ordinary authentication?                                   |
| Q03 | What keys, limits, time windows, reset rules, concurrency guarantees, and retention govern login throttles? |
| Q04 | What HTTP contract, public failure disclosure, and proof authorize a required password change?              |
| Q05 | How do password changes, administrative resets, and disabled accounts affect existing sessions?             |
