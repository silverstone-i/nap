# M0001-13: Login Throttle Hardening

## 1. Document Control

| Field                | Value                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                            |
| Type                 | Module Work Unit                                                                                                       |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                      |
| Related architecture | [BFF](../../../architecture/bff.md)                                                                                    |
| Related PRDs         | [M0001-03: Authentication](M0001-03-authentication.md), [M0001-04: Session management](M0001-04-session-management.md) |
| Related decisions    | None                                                                                                                   |
| Last reviewed        | 2026-10-10                                                                                                             |

## 2. Purpose

Stop the login throttle from locking out legitimate users while keeping
password guessing slow. Today one person's five typos lock their whole IP
(Internet Protocol) address for 15 minutes, which blocks everyone behind the
same office or mobile-carrier address. Correcting the email on the sixth attempt does not help. Anyone who
knows an email address can also keep that account locked indefinitely.

This Work Unit replaces the throttle rules in the second paragraph of
[M0001-03 §7](M0001-03-authentication.md#7-business-rules-and-invariants).
M0001-03-R003 (atomic, persistent throttle windows) still applies.

## 3. Scope

### Included

- A per-pair throttle on account input plus client address.
- Separate, higher limits for the client-address and account throttles.
- Doubling delays, capped at 30 seconds, on the address and account throttles.
- A known-device token that exempts a returning browser from the account lock.
- Clearing rules on successful login and on operator Unlock.

### Excluded

- CAPTCHA (a test that the caller is human): needs a third-party service.
- Checking passwords against breach lists: a password-policy change, not a throttle change.
- Alerting on throttle spikes: needs monitoring infrastructure the app does not have yet.
- Multi-factor authentication and passkeys: deferred until before the first production users.
- Emailed unlock codes: the app does not send email.

## 4. Actors And Permissions

| Actor                              | Operation                   | Result                                                      |
| ---------------------------------- | --------------------------- | ----------------------------------------------------------- |
| Anonymous caller                   | Submit login credentials    | Authenticate, reject, delay, or throttle                    |
| Anonymous caller on a known device | Submit login credentials    | Same, except the account throttle is not checked or counted |
| Napsoft operator                   | Unlock a login (I0008-R015) | Clears that login's account throttle                        |

## 5. Concepts And Terminology

| Term               | Meaning                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Account input      | The submitted email after `normalizeAccountInput`, whether or not an account exists for it |
| Client address     | The caller's IP address after `normalizeClientAddress`                                     |
| Throttle key       | HMAC (keyed hash) of a throttle kind and its value, as defined in M0001-03                 |
| Pair throttle      | Throttle keyed on account input plus client address                                        |
| Address throttle   | Throttle keyed on client address alone                                                     |
| Account throttle   | Throttle keyed on account input alone                                                      |
| Delay              | A short lock on the address or account throttle after a failure, before the hard lock      |
| Hard lock          | A 15-minute lock once a throttle reaches its failure limit                                 |
| Known device       | A browser holding a valid known-device token for the account it is signing in to           |
| Known-device token | Signed cookie, issued after an unrestricted successful login, that names one portal user   |

## 6. Functional Requirements

- M0001-13-R001: Login must check and record three throttle keys: pair, address, and account. Each kind must be part of its HMAC input so keys of different kinds cannot collide.
- M0001-13-R002: Each throttle must lock at its own failure limit within a 15-minute window, for 15 minutes:

  | Throttle | Failures that hard-lock | Counted when                     |
  | -------- | ----------------------: | -------------------------------- |
  | Pair     |                       5 | Every failure                    |
  | Address  |                     100 | Every failure                    |
  | Account  |                      20 | Failures not from a known device |

- M0001-13-R003: Failures must delay a key by doubling steps capped at 30 seconds (2, 4, 8, 16, 30, 30, and so on) until its hard lock. The account throttle starts at its 1st failure in the window; the address throttle starts at its 10th, so ordinary typos on a shared address delay no one. The pair throttle has no delay; its hard lock at 5 already limits guessing.
- M0001-13-R004: A login from a known device for the submitted account must skip the account throttle check and must not count against the account throttle. The pair and address throttles still apply.
- M0001-13-R005: A successful login must clear the account key and the pair key, and must leave the address key unchanged.
- M0001-13-R006: A successful login that is not restricted by `must_change_password` must issue or refresh a known-device token for that portal user, valid for 90 days.
- M0001-13-R007: Operator Unlock must clear the account key. Pair keys are left to expire, because an HMAC key cannot be traced back to the account.

## 7. Business Rules And Invariants

- M0001-13-R008: A known-device token must be bound to one portal user, signed with a key separate from the session and throttle secrets, and sent as an `HttpOnly` cookie (unreadable by page scripts), `Secure` outside development, with the session cookie's `SameSite` setting. A token with a bad signature, another user, or a past expiry is treated as an unknown device, never as an error.
- M0001-13-R009: A password change or password reset must invalidate every known-device token for that portal user.
- M0001-13-R010: Throttle responses must not reveal which key is locked, whether the account exists, or whether the device is known.

Unknown account inputs count on all three keys, the same as real ones. The
M0001-03 ordering (lock check before any credential read) applies to all three
keys, with one exception: when a known-device token is present, the portal user
it names is read first to validate it. No password is verified before the lock
check. Further attempts never change a live lock.

Worked example, one office address, user mistypes their email:

| Attempt | Input                           | Outcome                                                                                                      |
| ------: | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
|     1–5 | `ian@exmaple.com`, any password | Rejected; delays of 2, 4, 8, 16, then 30 s on the mistyped account key; that pair hard-locks after attempt 5 |
|       6 | `ian@example.com`, correct      | Succeeds at once: different pair and account keys, address at 5 failures with no delay below 10              |

## 8. Lifecycle And State Transitions

| Condition                                    | Action | Result                                                                              |
| -------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| Any of the applicable keys locked or delayed | Login  | `429 THROTTLED` with `Retry-After`, no credential read                              |
| Invalid credentials, unknown device          | Login  | Generic rejection; pair, address, and account failures recorded                     |
| Invalid credentials, known device            | Login  | Generic rejection; pair and address failures recorded                               |
| Valid credentials                            | Login  | Session; account and pair keys cleared; known-device token issued unless restricted |
| Password changed or reset                    | —      | Known-device tokens for that user invalid                                           |

## 9. Data Requirements

`admin.login_throttles` keeps its schema. Delays and hard locks both use
`locked_until`. The model's `recordFailure` must accept the delay schedule so
PostgreSQL still decides the count, the delay, and the lock in one statement.

The known-device token signature covers `admin.portal_users.password_hash`,
so any password change or reset voids every outstanding token (M0001-13-R009)
without a new column. A post-login rehash also voids them; that is acceptable.

## 10. API Requirements

`POST /api/admin-tenancy/v1/auth/login` keeps its request and response shapes.
Successful login may set the known-device cookie. `429 THROTTLED` keeps
`Retry-After`, which is now often a few seconds; the login screen must show a
countdown and re-enable submission when it ends.

## 11. Cross-Module Interactions

The known-device token is independent of the M0001-04 session cookie: logging
out or session expiry does not remove it.

## 12. Security And Audit

- M0001-13-R011: `auth.login.throttled` events must record which throttle kind refused the attempt and its key hash, never the raw email, raw address, or token value.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                    | Requirements                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| AC01      | Five failures with a wrong email followed by the correct email and password from the same address succeeds.                                                                        | M0001-13-R001, M0001-13-R002, M0001-13-R005 |
| AC02      | Five failures each with a different email followed by a correct login from the same address succeeds.                                                                              | M0001-13-R002                               |
| AC03      | The 100th failure from one address locks the address for every account; the 99th does not.                                                                                         | M0001-13-R002                               |
| AC04      | Account failures 1 to 6 delay it 2, 4, 8, 16, 30, and 30 s; address failures 1 to 9 cause no delay and 10 to 15 delay it 2, 4, 8, 16, 30, and 30 s; the pair key is never delayed. | M0001-13-R003                               |
| AC05      | 20 failures from unknown devices lock the account; a known device for that user can still sign in.                                                                                 | M0001-13-R002, M0001-13-R004                |
| AC06      | A token for another user, an expired token, or a tampered token is treated as unknown without an error.                                                                            | M0001-13-R008                               |
| AC07      | After a password change or reset, a previously issued token no longer exempts the account throttle.                                                                                | M0001-13-R009                               |
| AC08      | Success clears pair and account keys and leaves the address key; Unlock clears the account key.                                                                                    | M0001-13-R005, M0001-13-R007                |
| AC09      | Concurrent failures on one key record exactly one failure each and lock at the stated limit.                                                                                       | M0001-03-R003, M0001-13-R002                |
| AC10      | Throttle responses are identical whichever key refused; events name the kind and hash only.                                                                                        | M0001-13-R010, M0001-13-R011                |
| AC11      | The login screen shows the `Retry-After` countdown and re-enables submission when it ends.                                                                                         | M0001-13-R003                               |

### Verification Evidence

Local validation on 2026-10-10: `npm run lint`, `npm run format:check`,
`npm test` (579 API unit, 209 web, 25 toolchain, 1 shared), `npm run build`,
and `npm run licenses` passed. `npm run test:db:local` passed all 283
integration tests against a throwaway PostgreSQL 18 cluster.

[Integration tests](../../../../apps/api/tests/integration/authentication.test.js)
cover AC01–AC05, AC07, AC08, and AC09 against the real `recordFailure`
statement: the pair hard lock at five with the corrected email then
succeeding; five different wrong emails leaving a correct login open; the
address delayed at its 99th failure and hard-locked at its 100th; account
delays of 2, 4, 8, 16, 30, and 30 seconds; address failures 9 and 10 giving no
delay then 2 seconds; a known device signing in past an account lock without
counting against it, and another user's token giving no exemption; a password
change voiding an earlier token; no token for a restricted session; counting
continuing after a delay expires; and concurrent failures counted once each.

[Unit tests](../../../../apps/api/tests/unit/authentication.test.js) cover
AC06 (tampered, foreign-user, other-account, expired, and malformed tokens
treated as unknown), the known-device cookie's `HttpOnly`, `SameSite`, and
90-day `Max-Age`, the `kind` on `auth.login.throttled` (AC10), and startup
refusing a missing, short, or reused `KNOWN_DEVICE_SECRET_<ENV>`.
[Web tests](../../../../apps/web/tests/LoginPage.test.jsx) cover AC11: the
countdown re-enabling sign-in, and editing the email clearing a lock that may
belong to the mistyped address's pair key. A browser check against the local
dev servers showed the 2-second account delay counting down and clearing.

## 14. Outstanding Questions

- Do the limits (5 / 100 / 20) and the 90-day token lifetime suit expected customer sites, or should they be configuration settings?
