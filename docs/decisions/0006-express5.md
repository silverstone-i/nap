/**
 * @file ADR-0006: Express 5 adoption
 * @module docs/decisions
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

# ADR-0006: Express 5

## Status

Accepted

## Context

Express 5 reached stable release in late 2024. NAP is a greenfield
project with no legacy Express 4 middleware to migrate. Key differences:

| Feature | Express 4 | Express 5 |
|---|---|---|
| Async error handling | Manual `next(err)` required | Rejected promises auto-forwarded |
| `req.query` | Mutable, re-parsed on access | Getter, lazy-parsed once |
| Path matching | Custom regex (`:id`) | `path-to-regexp` v8 |
| `res.json()` | Calls `res.send()` | Direct write, no double-send |
| Node.js minimum | 0.10+ | 18+ |

## Decision

Use **Express 5** (`express@^5`) from the start. Since NAP has no
existing Express 4 codebase to migrate, we avoid accumulating v4 patterns
that would need refactoring later.

## Consequences

### Positive

- Async route handlers and middleware automatically forward rejected
  promises to the error handler — no need for `try/catch` wrappers or
  `express-async-errors`.
- Cleaner path matching with `path-to-regexp` v8.
- Modern Node.js requirement aligns with NAP's Node 20+ target.
- Forward-compatible — no future migration cost.

### Negative

- Some third-party middleware may not yet declare Express 5 compatibility
  (most work unchanged — passport, cors, cookie-parser, morgan all
  function correctly).
- Community resources and Stack Overflow answers still predominantly
  reference Express 4 patterns.
- `app.del()` removed (use `app.delete()`) and `app.param(fn)` removed —
  minor API surface changes.

### Mitigations

- Pin `express@^5` in package.json to track 5.x releases.
- All middleware is tested via supertest contract tests — incompatibilities
  surface immediately.
- Error handler middleware explicitly checks for Express 5's automatic
  promise rejection forwarding in tests.
