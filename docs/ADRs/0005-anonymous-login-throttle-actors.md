# 0005 — Anonymous login-throttle actors

- **Status:** Accepted
- **Date:** 2026-09-08
- **Requirements:** `ARCH-044`, `ARCH-045`

## Context

AUTH-005 records failed logins before an identity is authenticated. The database
record conventions require an authoritative actor on runtime writes, but the
accepted authentication design supplies no service identity for these records.
The owner approved the narrowly scoped exception in this task.

## Decision

Amend the specification's database record conventions: anonymous writes to
`admin.login_throttles` may carry null audit actors because no identity has
been authenticated. Authenticated writes retain their resolved actor. No other
table receives this exception. PRD 0003 links to this requirement.

## Alternatives and consequences

A dedicated service identity would add identity lifecycle and provisioning work
to transient throttling. Attributing unknown login attempts to root would record
a false actor. These counters retain database timestamps and hashed keys, while
null actors explicitly represent an anonymous caller in this table alone.
