# Authentication & RBAC

This document consolidates the authentication strategy, token handling, and RBAC (“brace”) model used
by `nap-serv`. Treat it as the single source of truth for anything related to user identity, session
lifetimes, and permissions.

---

## Token Strategy

- Users authenticate with `email` + `password`. On success the server issues:
  - **Access token** (`auth_token` cookie): 15-minute lifetime, HS256-signed (current state).
  - **Refresh token** (`refresh_token` cookie): 7-day sliding window, HS256-signed.
  - Cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`.
- Frontend periodically calls `/auth/refresh` to keep sessions alive; inactivity beyond 15 minutes
  forces reauthentication.
- A future migration will switch verification to RS256 and shrink access-token claims to `sub` + `ph`
  (permissions hash). The middleware already tolerates `ph` and will signal stale tokens via
  `X-Token-Stale`.

Token claims today include:

| Claim         | Purpose                                         |
|---------------|-------------------------------------------------|
| `sub` / `id`  | User UUID (legacy tokens may only have `email`) |
| `tenant_code` | Current tenant for tenant-scoped APIs           |
| `schema_name` | Explicit schema override (used by admin APIs)   |
| `role`        | Legacy role hint for UI                         |
| `ph`          | Optional permissions hash for cache validation  |

---

## Middleware Flow

1. `authRedis()` (see `src/middlewares/authRedis.js`)
   - Skips auth for login/refresh/logout/self-check routes.
   - Verifies the JWT from cookies (`ACCESS_TOKEN_SECRET` HS256).
   - Resolves tenant schema from headers (`x-tenant-code`) or claims.
   - Loads `perm:<userId>:<tenant>` from Redis; if missing, builds canonical permissions via
     `loadPoliciesForUserTenant`.
   - Attaches `req.user` and `req.ctx` (includes `tenant_code`, `schema`, `perms`).
   - Sets `X-Token-Stale: 1` header if claim hash differs from cached hash.
2. Route handlers may layer `rbac()` middleware (see [`developer-guide.md`](./developer-guide.md) for usage) to enforce
   required permission levels (`view` vs `full`).

`req.ctx` is the canonical object downstream code should rely on for tenant-aware logic.

---

## Permission Caching

- Redis keys:
  - `perm:<userId>:<tenantCode>` → `{ hash, version, updatedAt, perms }`
  - Session/context keys (e.g. `ctx:<sid>`) can be layered on top when RS256 migration lands.
- `calcPermHash` generates a stable SHA-256 hash from the canonical permission payload.
- Cached entries control whether frontend tokens are considered stale and allow permission updates
  to take effect immediately (new `hash` invalidates existing tokens).

---

## RBAC Data Model

Tables live under the `core` module:

| Table           | Purpose                                              |
|-----------------|------------------------------------------------------|
| `roles`         | System (`super_admin`, `admin`) and tenant-defined roles |
| `role_members`  | Links users to roles (optionally primary role flag)  |
| `policies`      | Grants `level` (`none`, `view`, `full`) per module/router/action |

Key rules:

- `tenant_id`/`tenant_code` columns exist for all three tables but stay out of unique constraints
  (schema isolation handles uniqueness).
- `roles` includes `is_system` and `is_immutable` for built-in roles.
- `policies` uniqueness is `(role_id, module, router, action)`; evaluation order:
  1. `module::router::action`
  2. `module::router`
  3. `module`
  4. default `none`
- Controllers or routers annotate required access using helper middleware to distinguish `view`
  (GET/HEAD/export) versus `full` (mutations, approvals).

---

## Built-in Roles & Seeding

`src/seeds/seed_rbac.js` initialises:

- System roles (tenant-agnostic):
  - `super_admin` – bypasses all permission checks.
  - `admin` – full control within the current tenant except restricted modules like `tenants`.
- Example tenant role `project_manager` with sample policies:
  - `projects` → `full`
  - `gl` → `view`
  - `ar` → `view`
  - `ar / invoices / approve` → `none`

Extend the seed when shipping new default roles or module policies so tests and local environments
stay aligned.

---

## Route Integration Tips

- Decorate routers with RBAC metadata at the highest level possible:

  ```js
  router.use(withMeta({ module: 'projects' }));
  router.get('/', rbac('view'), controller.index);
  router.post('/', rbac('full'), controller.create);
  ```

- For mixed-sensitivity GET routes (e.g. `/export`), explicitly request `rbac('full')`.
- Ensure tests create tokens with matching policies; see `tests/rbac/`.

---

## Future Work

- Switch JWT signing to RS256 and trim access-token payload to `sub` + `ph`.
- Expand cached context to include session IDs for targeted revocation.
- Build an audit trail around role/policy changes.
- Provide an admin API for tenants to manage custom roles with validation.

---

## References

- `src/middlewares/authRedis.js`
- `src/utils/permHash.js`
- `src/utils/RbacPolicies.js`
- `modules/core/schema/*.js` (RBAC tables)
- `tests/rbac/` suites for expected behaviour
