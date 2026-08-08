# 0015 — Password credential storage

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

Login is email + password against `admin.portal_users` (ADR-0004),
whose `password_hash` column is nullable text. Nothing yet records how
the hash is produced or what a NULL means. This is a fresh decision:
DESIGN.md floated bcrypt, but DESIGN.md is reference material and
decides nothing.

## Decision

1. **Passwords are hashed with argon2id** via the `argon2` package
   (MIT licensed). Parameters are configurable by environment and must
   meet the Open Worldwide Application Security Project (OWASP)
   baseline: 19 MiB memory, 2 iterations, parallelism 1. Configuration
   may raise them, never lower.
2. **A NULL `password_hash` means no credential exists**, not an empty
   password: login is refused before any hash comparison. This is the
   state of an invited-but-not-activated user.
3. **Verification rehashes opportunistically.** When a login verifies
   against a hash whose recorded parameters lag the current
   configuration, the hash is recomputed and stored in the same
   request. Parameter upgrades then roll out at each user's next
   login, with no migration.
4. **Every writer of `password_hash` goes through the same hasher** —
   the login rehash, the future password-change and reset flows, and
   the admin bootstrap script alike. No second hashing path exists.

## Consequences

- Login costs an argon2id verification (tens of milliseconds by
  design); with sessions lasting hours (ADR-0014), the cost is paid
  rarely.
- `argon2` becomes a production dependency (native module; MIT, so
  allowlist-compatible).
- Old-parameter hashes persist until their owner next logs in;
  dormant accounts keep stale-cost hashes indefinitely.

## Alternatives considered

**bcrypt.** Rejected. Truncates input at 72 bytes and is not
memory-hard, so graphics-card attacks scale against it in a way
argon2id's memory cost blocks.

**scrypt (Node built-in).** Rejected. Avoids the native dependency,
but argon2id is OWASP's first-choice algorithm and scrypt's parameter
tuning is easier to get wrong; the dependency is the cheaper risk.
