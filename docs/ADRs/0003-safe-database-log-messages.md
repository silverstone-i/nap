# 0003 — Safe database log messages

- **Status:** Accepted
- **Date:** 2026-09-06
- **Requirement:** `ARCH-045`

## Context

The installed pg-schemata logger receives structured row/error metadata, but
some message strings also interpolate dependency errors. Dropping metadata
alone cannot satisfy the specification's prohibition on sensitive diagnostics.
The owner approved this clarification during operational baseline planning.

## Decision

Apply the amended [operational standards](../specs/nap-platform-specification.md#operational-standards).
The adapter discards metadata and preserves only recognized safe message forms;
all other messages become fixed diagnostics before Pino receives them. A request
failure is emitted by the handling boundary, avoiding duplicate library logs.

## Alternatives and consequences

Forwarding arbitrary strings leaks data. Pattern-based secret replacement cannot
reliably recognize every SQL value or credential. Requiring an upstream release
would delay the baseline without removing the application's logging obligation.
Conservative message selection loses detail but preserves safe event categories
and correlation. New safe forms require explicit review. Audit records retain
their independent database ownership.
