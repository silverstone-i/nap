# M0001-03: Authentication

## 1. Document Control

| Field                | Value                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                             |
| Type                 | Module Work Unit                                                                                  |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                 |
| Related architecture | [BFF](../../../architecture/bff.md)                                                               |
| Related PRDs         | [M0001-01](M0001-01-tenant-and-portal-user-access.md), [M0001-04](M0001-04-session-management.md) |
| Related decisions    | None                                                                                              |
| Last reviewed        | 2026-09-18                                                                                        |

## 2. Purpose

Verify portal-user passwords, require replacement of temporary passwords, and
slow repeated login attacks.

## 3. Scope

### Included

- Password hashing and verification.
- Login throttling by account and client address.
- Required password replacement.

### Excluded

- Session persistence and cookies.
- Password-reset and account-recovery workflows.
- Portal-user administration.

## 4. Actors And Permissions

| Actor                         | Operation                                     | Result                                     |
| ----------------------------- | --------------------------------------------- | ------------------------------------------ |
| Anonymous caller              | Submit login credentials                      | Authenticate, reject, or throttle          |
| Authenticated user            | Prove current password and supply replacement | Replace password and revoke other sessions |
| Password-change-required user | Replace temporary password                    | Continue with a normal session             |
| Operator                      | Set a temporary password through WU 8         | Force replacement on next login            |

## 5. Concepts And Terminology

| Term               | Meaning                                                |
| ------------------ | ------------------------------------------------------ |
| Password hash      | Argon2id output stored instead of the password         |
| Restricted session | Session allowed to change the password or log out only |
| Throttle key       | HMAC of normalized account input or client address     |

## 6. Functional Requirements

- M0001-03-R001: Login must verify the supplied password against the stored Argon2id hash using the authentication-only credential lookup.
- M0001-03-R002: `must_change_password` must restrict the session until a valid replacement password is stored.
- M0001-03-R003: Failed login attempts must update and enforce persistent account and client-address throttle windows atomically.
- M0001-03-R004: Unknown, locked, disabled, archived, or invalid accounts must not create an ordinary session.

## 7. Business Rules And Invariants

- M0001-03-R005: Plaintext passwords and password hashes must not appear in ordinary reads, responses, logs, or events.
- M0001-03-R006: Password replacement and `must_change_password = false` must commit together; failure preserves the old hash and flag.

Use Argon2id with at least 19 MiB memory, two iterations, one lane, and a unique
salt. Passwords must contain 12–128 Unicode characters. Rehash after successful
login when configured parameters increase.

Login evaluates account and client-address keys. Five failures in 15 minutes
lock that key for 15 minutes. A successful login clears the account key. Unknown
accounts run one dummy Argon2id verification to avoid account-discovery timing.
Expired throttle rows may be deleted after 24 hours.

## 8. Lifecycle And State Transitions

| Condition                                    | Action          | Result                                         |
| -------------------------------------------- | --------------- | ---------------------------------------------- |
| Active account, valid password               | Login           | Normal session                                 |
| Active account, valid temporary password     | Login           | Restricted session                             |
| Invalid credentials                          | Login           | Generic rejection and throttle update          |
| Locked throttle key                          | Login           | `THROTTLED` without authentication             |
| Valid current password and valid replacement | Change password | New hash, cleared flag, other sessions revoked |

## 9. Data Requirements

This Work Unit uses `admin.portal_users` and `admin.login_throttles`. M0001-00
defines their schema and credential-specific model methods.

## 10. API Requirements

| Method and route                           | Request                            | Success                       | Failure                                                        |
| ------------------------------------------ | ---------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| `POST /api/admin-tenancy/v1/auth/login`    | `{ email, password }`              | `200` session view and cookie | `401 UNAUTHENTICATED` or `429 THROTTLED`                       |
| `POST /api/admin-tenancy/v1/auth/password` | `{ currentPassword, newPassword }` | `200` with no secret data     | `400 INVALID_INPUT`, `401 UNAUTHENTICATED`, or `403 FORBIDDEN` |

Login failures use the same public message. `THROTTLED` includes `Retry-After`.
Password change requires a valid same-origin session and request protection.

## 11. Cross-Module Interactions

M0001-04 creates and revokes sessions. Password changes revoke every other
session. Disabling or archiving an account causes all its sessions to fail
resolution and be revoked by WU 8.

## 12. Security And Audit

Record login success, login failure, throttling, and password change without
the password, hash, raw email, or raw client address. Failure events use the
request ID and hashed throttle key.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                       | Requirements                 |
| --------- | ----------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Valid active credentials authenticate; all ineligible or invalid cases receive the generic rejection. | M0001-03-R001, M0001-03-R004 |
| AC02      | Temporary-password login permits only password replacement and logout.                                | M0001-03-R002                |
| AC03      | Concurrent failures enforce both throttle keys and the stated window.                                 | M0001-03-R003                |
| AC04      | Password replacement is atomic and revokes every other session.                                       | M0001-03-R006                |
| AC05      | Responses, logs, and events contain no plaintext password, hash, raw email, or raw client address.    | M0001-03-R005                |

## 14. Outstanding Questions

None.
