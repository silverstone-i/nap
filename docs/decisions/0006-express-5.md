# 0006. Express 5 over Fastify/Koa

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP's backend requires an HTTP framework for its REST API. The framework must support ES Modules, middleware composition (CORS, cookie parsing, logging, authentication, RBAC), and async error handling without manual `try/catch` wrappers. The team has extensive experience with Express. Express 5 (the first major release since Express 4 in 2014) adds native async/await error propagation and other improvements.

## Decision

Use Express 5 with ES Modules as the HTTP framework. The request pipeline is:

CORS → JSON/cookie parsing → Morgan logging → `authRedis()` middleware → route-level `withMeta()` + `rbac()` → handler → response

Express 5's automatic async error handling means rejected promises in route handlers propagate to the error middleware without explicit `try/catch` or `next(err)` calls. The API runs on port 3000 with Vite's dev proxy forwarding `/api` requests from port 5173.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Fastify | Higher raw throughput; built-in schema validation; structured logging | Different middleware paradigm (hooks/plugins vs. `use()`); smaller ecosystem of middleware; team would need to learn a new framework; plugin encapsulation model adds complexity |
| Koa | Cleaner async/await design (from the start); lightweight core | Smaller middleware ecosystem than Express; less community adoption; many Express middleware packages require Koa-specific ports |

## Consequences

**Positive:**
- Mature ecosystem — vast library of compatible middleware (Passport, cors, cookie-parser, morgan, etc.)
- Team familiarity — no ramp-up time; established patterns and conventions
- Express 5 async error handling eliminates boilerplate `try/catch` in every route handler
- Large community — extensive documentation, Stack Overflow support, and battle-tested in production

**Negative:**
- Lower raw throughput than Fastify (acceptable for NAP's expected load)
- Express's middleware model is less structured than Fastify's plugin encapsulation — discipline required to avoid middleware ordering bugs
- Express 5 was in beta for years; ecosystem compatibility may lag for some older middleware packages
