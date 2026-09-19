# Backend for Frontend (BFF) Architecture

## Purpose

NAP uses one application-owned API as the backend for the React web app. The
API is the boundary between browser screens and NAP data. It handles sessions,
tenant selection, authorization, routing to the correct database, and safe
response envelopes.

The browser never chooses a database and never talks directly to PostgreSQL,
Redis, or a tenant cell.

## Why

The BFF keeps the security model simpler by making the server the only place
where sensitive application decisions happen. The browser receives only data
the API has already validated, authorized, and shaped for the active session.

- The web app calls same-origin `/api/...` routes.
- The API owns session cookies, request validation, authorization, and error
  handling.
- The API connects to one central admin database and zero or more tenant cell
  databases.
- Cell selection comes from the resolved server-side session, not from a client
  query string, request body, or header.
- Production can serve the built web app and API from one Node process.

This avoids browser-side service discovery, separate public APIs per cell, and
client-controlled database routing.

## Stack

NAP is a PERN application:

- PostgreSQL stores admin data and tenant-cell data.
- Express serves health endpoints, static production web assets, and API
  routes.
- React renders the web application.
- Node runs the API process and local tooling. Development and deployment must
  use the version pinned by the project.

The supporting stack uses `pg-schemata` for PostgreSQL models and migrations,
Zod for shared transport validation, Redis for optional cache acceleration,
and MUI for the web UI.

## Runtime Shape

At startup, the API must create:

- one admin database handle;
- a UUID-keyed cell registry;
- an optional Redis-backed authorization cache;
- the Express runtime.

The Express app must provide correlation and request logging, optional
production static web serving, session resolution, JSON parsing, health
routes, module routes, client-route fallback for the built web app, and a
shared error handler.

The runtime must manage process startup and shutdown. Startup requires admin
readiness before listening. Each configured cell is checked independently; an
unavailable cell is quarantined while admin and healthy cells can keep serving.
Shutdown drains HTTP before closing database pools.

## Development Setup

Development runs the API and web dev server separately:

- `npm run dev:api` starts the API on port `3000`.
- `npm run dev:web` starts Vite for the React app.
- The web development server proxies `/api` to `http://localhost:3000` so
  browser requests keep a same-origin shape.

Database setup, migration, bootstrap, and seed commands follow the
[migration strategy](migrations.md).

## Production Setup

In production, the API can serve the built web app from `apps/web/dist`.
Requests whose path starts with `/api` or `/health` go to Express routes.
Other browser navigation requests fall back to the built React entry point.

Production configuration is environment-driven. The API reads the active
environment suffix from `NODE_ENV`:

- `development` uses `*_DEV` settings.
- `test` uses `*_TEST` settings.
- `production` uses `*_PROD` settings.

Runtime database configuration uses:

- `ADMIN_DATABASE_<ENV>` for the admin database endpoint;
- `CELL_DATABASES_<ENV>` for a JSON map of cell UUIDs to cell database
  endpoints;
- `NAP_APP_PSWD_<ENV>` and `NAP_ADMIN_PSWD_<ENV>` for local role passwords;
- production JSON entries that include endpoint and role passwords.

Maintenance commands also accept `SETUP_DATABASE_<ENV>` for the maintenance
endpoint and `ADMIN_DATABASE_NAME_PROD` for the production Admin database name.
Provider setup may resolve endpoints after creating the resource. These settings
are not required for ordinary runtime startup.

Reject database configuration names outside this contract.

## Browser Request Protection

The web app and API use the same origin; the API does not grant cross-origin
access through CORS.

Before a state-changing API operation runs, validate the request's `Origin`
against the configured public application origin, including scheme, hostname,
and port. Use the browser-facing development origin when Vite proxies requests.
Do not derive the trusted origin from an unvalidated `Host` or forwarded header.
If `Origin` is absent, validate the origin of `Referer` instead. Reject a
mismatched, malformed, or `null` Origin without falling back to Referer; reject
requests with neither header. Rejections return `403 FORBIDDEN` without running
the operation.

Apply this check to POST, PUT, PATCH, and DELETE routes, including login,
logout, bodyless requests, and spreadsheet uploads. GET, HEAD, and OPTIONS must
not expose business mutations. Session expiry and last-seen bookkeeping remain
part of session resolution.

Session cookies use `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
`SameSite=None` is not supported by this deployment model. JSON operations
reject nonempty bodies with other content types; spreadsheet imports accept
only their declared upload type. Neither a bodyless request nor an upload
bypasses the origin check. This policy does not require a separate CSRF token.

Verification must cover valid same-origin requests, foreign and null origins,
missing headers, Referer fallback, bodyless logout, and spreadsheet uploads.
Rejected requests must leave application state unchanged. Production cookie
configuration must reject `SameSite=None`.

## API Routing

All module routes are mounted under:

```text
/api/<module>/v<version>/<router>
```

The route registry is the composition point for API routers. Each registration
must name:

- the module name;
- the router name;
- the version;
- whether the router uses the admin database or a tenant cell database;
- the factory that builds the Express router.

Admin routes receive the admin handle. Cell routes are built once per ready
cell and dispatched by the caller's resolved session.

## Request Flow

For a normal browser API request:

1. The web app calls `/api/...` through its shared request client.
2. The browser sends the session cookie with `credentials: 'same-origin'`.
3. Express assigns correlation and logging context.
4. Browser request protection validates state-changing requests before session
   resolution or the requested operation can change state.
5. Session middleware resolves the current portal user, tenant membership, and
   selected cell.
6. The route registry dispatches admin routes to the admin database, or cell
   routes to the session's cell.
7. Cell routes re-check that the selected cell is ready and that the session is
   still authorized for it.
8. The API returns a validated success or error envelope.
9. The web client validates the response envelope before showing data.

## Business Rules

- The client cannot select a database.
- A cell route requires a resolved session with both a tenant ID and a cell ID.
- A missing, unavailable, or unsafe cell returns service unavailable rather
  than falling back to another cell.
- Admin routes are for central administration and session/control operations.
- Business module routes run against cell databases.
- Health endpoints are separate from application authorization:
  `/health/live` reports process liveness, and `/health/ready` reports
  readiness to receive traffic.
- Redis may speed repeated authorization/session lookups, but PostgreSQL
  remains the source of truth.

## What This Document Does Not Cover

This document explains the web/API boundary. Separate documents should cover:

- admin-to-cells architecture;
- migration, bootstrap, and seed workflow;
- the admin module;
- RBAC;
- module design;
- the core module;
- the module map.
