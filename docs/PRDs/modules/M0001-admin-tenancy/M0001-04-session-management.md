# M0001-04: Session Management

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                      |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                                                                           |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                                                                          |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                                                            |
| Related architecture | [BFF](../../../architecture/bff.md), [Module design](../../../architecture/module-design.md)                                                                                                                                                                                                                                                                                               |
| Related PRDs         | [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md), [M0001-03: Authentication](M0001-03-authentication.md), [M0001-09: Tenant Selection and Support Access](M0001-09-tenant-selection-and-support-access.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                                                                           |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                                                                 |

## 2. Purpose

Create, resolve, rotate, expire, and revoke authenticated sessions using the
admin database as the source of truth.

## 3. Scope

### Included

- Persisted session identity and lifecycle.
- Validation of session credentials and their portal-user association.
- Session fields used by tenant selection and support access.

### Excluded

- Password verification and login throttling.
- Membership decisions, support authorization, and tenant transactions.
- Browser restoration, logout presentation, and shell behavior owned by C0002: Session Management.

## 4. Actors And Permissions

| Context                            | Actor                                | Required state or authority                   | Result                                      |
| ---------------------------------- | ------------------------------------ | --------------------------------------------- | ------------------------------------------- |
| Issue ordinary session             | Authentication application operation | Successful eligible outcome from unit 3       | Create a session                            |
| Resolve session                    | Request runtime                      | Valid session credential                      | Return the permitted session context        |
| Rotate or end own session          | Session holder                       | Valid proof under the agreed session contract | Apply the corresponding lifecycle operation |
| Revoke another user's session      | Operator                             | Permission and scope unresolved               | Requires an explicit decision in Q03        |
| Resolve expired or revoked session | Any caller                           | Session is no longer valid                    | Deny authenticated context                  |

## 5. Concepts And Terminology

| Term                    | Meaning                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| Session credential      | Secret supplied by the client to identify or prove a session         |
| Rotation                | Replacement of session credentials under an agreed invalidation rule |
| Expiry                  | End of session validity determined by the expiry rules               |
| Revocation              | Explicit termination of session validity                             |
| Selected-tenant context | Central tenant selection attached to a session by unit 9             |

## 6. Functional Requirements

- M0001-04-R001: The module must create persisted sessions only from an authorized authentication outcome and associate them with the correct portal user.
- M0001-04-R002: Session resolution must validate the supplied credential and persisted session state before returning authenticated context.
- M0001-04-R003: The module must support rotation, expiry, and explicit revocation.
- M0001-04-R004: Unknown, invalid, expired, or revoked sessions must not resolve to ordinary authenticated context.
- M0001-04-R005: Session storage must support the tenant-selection and support-attribution contract owned by unit 9 without allowing ordinary session updates to bypass it.

## 7. Business Rules And Invariants

- M0001-04-R006: Session changes must preserve user association and lifecycle consistency when resolution, rotation, and revocation compete.

The token format, absolute or idle expiry, rotation overlap, concurrent-session
rules, and race guarantees remain open in Q01–Q02.

## 8. Lifecycle And State Transitions

| Starting condition                      | Operation                            | Required outcome                                   |
| --------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| Eligible authentication outcome         | Create                               | Persisted session linked to the authenticated user |
| Valid session                           | Resolve                              | Authorized context                                 |
| Valid session                           | Rotate                               | Replacement credential under Q02                   |
| Time limit reached                      | Resolve                              | Expired session does not authenticate              |
| Revocation requested with authority     | Revoke                               | Session no longer authenticates                    |
| Required-password-change authentication | Create or resolve restricted context | Preserve unit 3 restrictions under Q04             |

Deletion and archival of expired records are separate retention decisions.

## 9. Data Requirements

| Table                       | Required meaning                                                                                                 | Relationships and access                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `admin.sessions`            | Session identity, credential-validation data, validity/expiry and revocation data, rotation state where required | References portal user; resolution by credential; lookup for revocation |
| `admin.sessions` extensions | Selected tenant and real/effective actor context as agreed by unit 9                                             | Central references; no client-supplied database connection              |

Session records are security-sensitive. Exact keys, credential representation,
timestamps, indexes, and retention remain open in Q01–Q02 and Q05. Unit 9 owns
selection semantics even though this unit owns the base table.

## 10. API Requirements

| Operation | Input                           | Result                            |
| --------- | ------------------------------- | --------------------------------- |
| Create    | Verified authentication outcome | New session and client credential |
| Resolve   | Client session credential       | Valid context or rejection        |
| Rotate    | Authorized current session      | Replacement credential or failure |
| Revoke    | Authorized session target       | Revocation outcome                |

The BFF owns session cookies. Public methods and routes, cookie attributes,
request protection, status codes, repeated-revocation behavior, and response
schemas remain open in Q01–Q03. Tenant switching is specified in unit 9.

## 11. Cross-Module Interactions

- [M0001-03: Authentication](M0001-03-authentication.md) supplies authentication and required-password-change outcomes.
- [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md) supplies the central portal-user identity.
- [M0001-09: Tenant Selection and Support Access](M0001-09-tenant-selection-and-support-access.md) validates tenant and support context before session mutation.

C0002: Session Management owns browser integration and references this lifecycle.
Session creation and resolution require no cell database. Opening a selected
tenant transaction belongs to later integration work.

## 12. Security And Audit

- M0001-04-R007: Session credentials must not appear in ordinary session views, logs, or administrative events.

[M0001-11: Cache Consistency](M0001-11-cache-consistency.md) defines cached-resolution invalidation; PostgreSQL remains authoritative.
[M0001-12: Administrative Events](M0001-12-administrative-events.md) defines session lifecycle events. Account disable, password change,
membership change, and role-removal effects require the shared rules in Q04.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                        | Requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01      | Eligible verification creates a session for the correct user; rejected verification cannot.                                                            | M0001-04-R001                                                                                                                                          |
| AC02      | Valid sessions resolve; unknown, tampered, expired, and revoked credentials do not authenticate.                                                       | M0001-04-R002, M0001-04-R004                                                                                                                           |
| AC03      | Rotation, expiry boundaries, and revocation follow the agreed lifecycle and retry rules.                                                               | M0001-04-R003                                                                                                                                          |
| AC04      | Ordinary session updates cannot inject another tenant or support actor context.                                                                        | M0001-04-R005                                                                                                                                          |
| AC05      | Competing rotate, resolve, and revoke operations meet the selected race guarantees.                                                                    | M0001-04-R006                                                                                                                                          |
| AC06      | Public views and recorded output omit session secrets.                                                                                                 | M0001-04-R007                                                                                                                                          |
| AC07      | Applicable source mutations invalidate their cached decisions and record the required catalogue events; failures follow the accepted shared contracts. | [M0001-11-R002](M0001-11-cache-consistency.md#6-functional-requirements), [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

## 14. Open Questions

| ID  | Decision required before acceptance                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------- |
| Q01 | What credential format, storage, cookie settings, endpoints, and expiry rules apply?                       |
| Q02 | What rotation overlap, race, repeated-revocation, concurrent-session, and cleanup rules apply?             |
| Q03 | Who can rotate or revoke which sessions, and what request proof is required?                               |
| Q04 | How are restricted password-change sessions and account, credential, membership, or role changes enforced? |
| Q05 | Which unit 9 context fields and retention rules belong in the final session schema?                        |
