
# nap-serv Auth Spec — Minimal JWT (`sub`, `ph`) + Permissions Hash & Cache
**Date:** 2025-08-31  
**Scope:** nap-serv backend (Node.js ESM, Express, PostgreSQL, pg-schemata, multi-tenant)  
**Audience:** Server/API engineers working on auth and RBAC

---

## 1) Goals (TL;DR)
- **Small, safe JWTs**: only `sub` (user id) and `ph` (permissions hash) + standard claims.
- **No PII in tokens**: email/username/IP/UA stay server-side.
- **Fast auth**: cache user/tenant context; DB on cold start only.
- **Instant authZ updates**: when perms change, hash flips → tokens become *stale* and clients refresh.

---

## 2) Data Model (given)
User table (relevant fields):
```sql
id uuid primary key default uuidv7() not null,
tenant_code varchar(6) not null unique,
schema_name varchar(6) not null unique,
email varchar(255) not null,
password_hash text not null,
user_name varchar(100) not null,
role varchar(50) not null
```
Notes:
- `email`, `user_name`, `tenant_code`, `schema_name` are **not** placed in JWT.
- `role` is an input to compute effective permissions, not emitted to clients in JWT.

---

## 3) JWT Shape
**Algorithm:** RS256 (asymmetric).  
**Lifetime:** 15 minutes access token; 7-day refresh token (rotating).  
**Where:** httpOnly, Secure, SameSite=Lax cookies; no tokens in localStorage.

### 3.1 Access Token Claims
```json
{
  "sub": "<user_uuid>",            // REQUIRED: user id (UUIDv7)
  "ph":  "<sha256_perm_hash>",     // REQUIRED: permissions hash (see §4)
  "sid": "<session_id>",           // OPTIONAL: for cache keying/revocation
  "iss": "nap-serv",
  "aud": "nap-serv-api",
  "iat": 1730000000,
  "exp": 1730000900,
  "jti": "<random-uuid>"
}
```

### 3.2 Refresh Token Claims
- Minimal: `sub`, `sid`, `iss`, `aud`, `iat`, `exp`, `jti`.
- Stored & rotated in a server-side session store keyed by `sid`.

---

## 4) Permissions Hash (`ph`)
**Purpose:** detect changes in the user's *effective authorization* without putting perms into the JWT.

### 4.1 Canonical Data to Hash
Use the **effective** authorization state for a specific **(user, tenant)**:
```json
{
  "policy_version": "7",
  "roles": ["role:admin","role:pm"],                        // IDs only, sorted
  "grants": [
    { "resource":"projects",   "action":"read",   "scope":"tenant" },
    { "resource":"budgets",    "action":"approve","scope":"unit"   },
    { "resource":"gl.journal", "action":"post",   "scope":"tenant" }
  ],
  "constraints": [
    { "resource":"projects", "rule":[{"field":"company_id","op":"in","value":["c1","c2"]}] }
  ],
  "modules": { "ap":true, "ar":true, "intercompany":false }
}
```
**Exclude**: PII (email, name), timestamps, nonces, unordered structures.

### 4.2 Hashing (ESM)
```js
import { createHash } from 'node:crypto';

const stable = (v) => Array.isArray(v)
  ? v.map(stable).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  : v && typeof v === 'object'
  ? Object.keys(v).sort().reduce((o,k) => (o[k] = stable(v[k]), o), {})
  : v;

export const calcPermHash = (canon) =>
  createHash('sha256').update(JSON.stringify(stable(canon))).digest('hex');
```

---

## 5) Caching & Keys
**Primary store:** Redis (shared). Optional per-process LRU for micro-optimizations.

### 5.1 Redis Keys
- `perm:<userId>:<tenantCode>` → `{ hash, version, updatedAt, perms }`
- `ctx:<sid>` → `{ tenantSchema, tenantId, roleId, perm_hash, policyVersion, ... }`
- `session:<sid>` → refresh token metadata, rotation counters, IP/UA (if needed)  
- Pub/Sub channel: `perm:update` → `{ userId, tenantCode, version, hash }`

**TTL:** ≤ access token `exp` for `ctx:*` entries. `perm:*` can be longer; update on writes.

---

## 6) Request Flow
1) **Verify JWT** (sig, `exp`, `iss`, `aud`).  
2) Extract `sub`, `ph`, `sid`.  
3) Read `perm:<sub>:<tenant>` from Redis. If missing → rebuild from DB once and set.  
4) **Compare** token `ph` to Redis `hash`:
   - **Match** → proceed.  
   - **Mismatch** → treat token as **stale**. Enforce authorization using Redis `perms` (authoritative), and signal client to refresh.

### 6.1 Middleware (ESM)
```js
import jwt from 'jsonwebtoken';
import { redis } from '../utils/redis.js';
import { calcPermHash } from '../utils/permHash.js';

export const auth = () => async (req, res, next) => {
  try {
    const token = req.signedCookies.access_token;
    const claims = jwt.verify(token, process.env.JWT_PUBLIC_KEY, {
      algorithms: ['RS256'], audience: 'nap-serv-api', issuer: 'nap-serv',
    });

    const { sub: userId, ph: tokenHash, sid } = claims;
    const tenantCode = req.headers['x-tenant']; // or route param; validated separately

    const permKey = `perm:${userId}:${tenantCode}`;
    let rec = await redis.get(permKey).then(v => v && JSON.parse(v));

    if (!rec) {
      const canon = await req.models.permissions.buildCanon({ userId, tenantCode });
      const hash = calcPermHash(canon);
      rec = { hash, version: 1, updatedAt: Date.now(), perms: canon };
      await redis.set(permKey, JSON.stringify(rec));
    }

    req.user = { id: userId, sid, tenantCode, perms: rec.perms };

    if (tokenHash !== rec.hash) {
      res.setHeader('X-Token-Stale', '1');
      // Option A (strict):
      // return res.status(401).json({ code: 'TOKEN_STALE' });
      // Option B (soft, better DX): continue; client refreshes in background.
    }

    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};
```

---

## 7) When Permissions Change
Triggered by admin actions or role/policy updates.

**Transaction:**
1. Update DB (roles/grants/constraints/module flags).  
2. Recompute canonical perms for affected (user, tenant).  
3. Compute new hash; bump `version`.  
4. `SET perm:<uid>:<tenant>` with new `{hash, version, updatedAt, perms}`.  
5. `PUBLISH perm:update` so all app nodes drop local LRU.  
6. (Optional) bump `token_version` in user/session to force 401 on all old tokens.

**Client impact:** next request sees `X-Token-Stale: 1` (or 401 `TOKEN_STALE`) → call `/auth/refresh` → new JWT with updated `ph`.

---

## 8) Login & Refresh
### 8.1 Login
- Verify credentials → load tenant context → build canonical perms → compute `ph` → issue access + refresh tokens → seed `ctx:<sid>` and `perm:<uid>:<tenant>`.

### 8.2 Refresh
- Verify refresh token (cookie + session record).  
- Re-read `perm:<uid>:<tenant>` → use `hash` as `ph`.  
- Rotate refresh token; issue new access token.  
- If session revoked or `token_version` mismatched → 401.

---

## 9) Error Codes & Headers
- `401 TOKEN_STALE` → token valid but out-of-date perms.  
- `401 TOKEN_REVOKED` → session revoked / version mismatch.  
- `X-Token-Stale: 1` → soft warning; client should refresh.  
- `X-Trace-Id` → include in all error responses.

---

## 10) Security Notes
- Keep JWTs **tiny**: no PII, no emails, no schema names.  
- Cookies: `httpOnly`, `Secure`, `SameSite=Lax`; set `Domain` per deployment.  
- Keys: rotate RS256 keys; maintain `kid` header and JWKS endpoint internally.  
- Auditing: record login/refresh/revoke with IP/UA **server-side only** (not in JWT).  
- Rate-limit `/auth/login` and `/auth/refresh`.
- Cache poisoning: never trust client claims for perms; server uses Redis/DB as truth.

---

## 11) Migration Plan
1. **Add utils**: `utils/permHash.js`, Redis pub/sub wiring.  
2. **Create endpoints**: `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`.  
3. **Wire middleware**: `auth()` (JWT verify), `rbac()` (uses `req.user.perms`).  
4. **Backfill**: build `perm:*` for existing users on first login/refresh.  
5. **Remove PII** from JWT issuance; update clients to read display data from `/me`.  
6. **Docs**: update README and API docs with claim list and error/refresh flow.

---

## 12) Example Issuance (ESM)
```js
import jwt from 'jsonwebtoken';
import { calcPermHash } from '../utils/permHash.js';

export async function issueTokens({ userId, tenantCode, sessionId, permsCanon }) {
  const ph = calcPermHash(permsCanon);
  const base = { issuer: 'nap-serv', audience: 'nap-serv-api', algorithm: 'RS256', keyid: process.env.JWT_KID };
  const now = Math.floor(Date.now()/1000);

  const access = jwt.sign(
    { sub: userId, ph, sid: sessionId, iat: now },
    process.env.JWT_PRIVATE_KEY,
    { ...base, expiresIn: '15m' }
  );

  const refresh = jwt.sign(
    { sub: userId, sid: sessionId, iat: now },
    process.env.JWT_PRIVATE_KEY,
    { ...base, expiresIn: '7d' }
  );

  return { access, refresh, ph };
}
```

---

## 13) Client Guidance
- Intercept `401 TOKEN_STALE` or header `X-Token-Stale: 1`.  
- Call `/auth/refresh` once; retry the original request.  
- Do not store JWTs outside cookies.  
- Fetch `/api/v1/me` for display fields (`email`, `user_name`) when needed.

---

## 14) Test Checklist
- Login sets `perm:*` and returns JWT with `ph`.  
- Changing role flips `ph` → next request yields stale signal.  
- Refresh issues new token with updated `ph`.  
- Old tokens rejected if `token_version` bumped.  
- No PII present in any JWT.  
- Multi-node: Redis Pub/Sub invalidates local LRUs.

---

**Done.**
