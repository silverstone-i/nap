/**
 * @file Authentication business rules
 * @module docs/rules
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

# Authentication Rules

## Token Architecture

### Access Token (JWT)

- **Storage:** httpOnly, Secure, SameSite=Strict cookie named `auth_token`
- **TTL:** 15 minutes
- **Claims:**
  - `sub` — nap_user UUID (primary key of `admin.nap_users`)
  - `ph` — SHA-256 hex hash of the user's permission canon (null in
    Phase 2; populated once RBAC is active)
  - `iss` — `nap-serv`
  - `aud` — `nap-serv-api`
- **Secret:** `ACCESS_TOKEN_SECRET` env var (minimum 32 characters)

### Refresh Token (JWT)

- **Storage:** httpOnly, Secure, SameSite=Strict cookie named
  `refresh_token`
- **TTL:** 7 days
- **Claims:** `sub` only (no permission hash)
- **Secret:** `REFRESH_TOKEN_SECRET` env var (separate from access secret)
- **Path:** `/api/auth` (only sent to auth endpoints)

### Cookie Configuration

| Property | Value |
|---|---|
| `httpOnly` | `true` |
| `secure` | `true` in production, `false` in development |
| `sameSite` | `strict` |
| `path` | `/` for access token, `/api/auth` for refresh token |
| `maxAge` | 15 min (access), 7 days (refresh) |

## Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character (`!@#$%^&*()_+-=[]{}|;:'",.<>?/`)
- Validated server-side on login creation and password change

## Authentication Flow

### Login (`POST /api/auth/login`)

1. Validate email exists in `admin.nap_users`
2. Check user status is `active` (not `locked` or `deactivated`)
3. Check associated tenant status is `active`
4. Verify password against bcrypt hash
5. Sign access + refresh tokens
6. Set httpOnly cookies
7. Return `{ message, forcePasswordChange }` — `forcePasswordChange` is
   `true` when the user's `force_password_change` flag is set (invited
   users on first login)

### Token Refresh (`POST /api/auth/refresh`)

1. Extract refresh token from `refresh_token` cookie
2. Verify JWT signature and expiration
3. Look up user by `sub` claim — verify still active
4. Sign new access token (with current permission hash)
5. Sign new refresh token (rotation)
6. Set new cookies

### Logout (`POST /api/auth/logout`)

1. Clear `auth_token` and `refresh_token` cookies
2. Return 200

### Auth Check (`GET /api/auth/check`)

- Lightweight endpoint — middleware verifies JWT, endpoint returns 200
- Used by client for silent session validation on app load

### Me (`GET /api/auth/me`)

- Returns full user context: user fields (excluding `password_hash`) +
  tenant fields
- Used by `AuthContext` to hydrate client state

### Change Password (`POST /api/auth/change-password`)

1. Verify current password against stored hash
2. Validate new password meets strength requirements
3. Hash new password with bcrypt
4. Update `password_hash` directly (raw SQL to avoid ColumnSet reset)
5. Clear `force_password_change` flag if set

## Middleware (`authRedis`)

### Request Processing

1. Check if path is in bypass list (`/auth/login`, `/auth/refresh`,
   `/auth/logout`, `/health`)
2. Extract `auth_token` from cookies
3. Verify JWT signature and expiration
4. Look up user from `admin.nap_users` by `sub` claim
5. Verify user status is `active`
6. Look up tenant from `admin.tenants` by `user.tenant_id`
7. Populate `req.user` with user fields + `tenant_code`
8. If `x-tenant-code` header present (cross-tenant access), resolve
   target tenant for NapSoft users

### Phase 2 Simplifications (expanded in Phase 3)

- No Redis permission cache read/write
- No RBAC permission loading
- No stale token detection (`X-Token-Stale` header)
- No impersonation session resolution
- Permission hash (`ph`) is null in all tokens

## nap_users Table Design (PRD §3.2.2)

The `admin.nap_users` table is a pure identity/login table:

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid | Primary key |
| `tenant_id` | uuid | FK to `admin.tenants` |
| `entity_type` | varchar(16) | Polymorphic link type (employee, vendor, client, contact) |
| `entity_id` | uuid | Polymorphic link to entity record in tenant schema |
| `email` | varchar(128) | Login identifier (unique) |
| `password_hash` | text | bcrypt hash |
| `status` | varchar(20) | active, locked, deactivated |

**Deliberately excluded** (per PRD): `tenant_code`, `user_name`,
`full_name`, `tax_id`, `notes`, `role`, `tenant_role`, `employee_id`.

- User profile data lives on the linked entity record
- Roles are stored as `text[]` on entity records, not on nap_users
- `entity_type` and `entity_id` are null for the bootstrap super user
  (entity tables don't exist until Phase 5)

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ACCESS_TOKEN_SECRET` | Yes | — | JWT signing secret for access tokens |
| `REFRESH_TOKEN_SECRET` | Yes | — | JWT signing secret for refresh tokens |
| `ROOT_EMAIL` | Yes | — | Bootstrap super user email |
| `ROOT_PASSWORD` | Yes | — | Bootstrap super user password |
| `ROOT_TENANT_CODE` | No | `NAP` | Bootstrap tenant code |
| `ROOT_COMPANY` | No | `NapSoft LLC` | Bootstrap tenant company name |
| `BCRYPT_ROUNDS` | No | `12` | bcrypt cost factor (4 in test) |
