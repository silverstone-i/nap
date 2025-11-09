# Login Route Trace (For Dummies)

_Goal:_ explain, in plain language, what happens when a user signs in through the `/api/auth/login` route, with a focus on every context that participates (React contexts in the client and request contexts on the server).

---

## 0. App bootstraps and loads contexts

1. `src/main.jsx` renders `ThemedApp`, wrapping the UI in three nested providers:
   - **React Query `QueryClientProvider`** – globally tracks async queries, though the login flow currently uses manual `fetch` calls.
   - **MUI `ThemeProvider`** + `CssBaseline` – puts the Material UI theme on React’s context so components like `LoginPage` can call `useTheme()` to switch logos/colors (`LoginPage.jsx` lines 17-20, 43-53).
   - **`AuthProvider` (from `context/AuthContext.jsx`)** – exposes `{ user, loading, login, logout }` via React context. Every auth-aware component calls `useAuth()` to reach this state machine.

2. Inside `AuthProvider`, a `useEffect` immediately tries to populate `user` by calling `api.me()`. Until this finishes the `loading` flag stays `true`. No credentials means `user` remains `null`, so the UI keeps showing `LoginPage`.

---

## 1. User fills out `LoginPage`

1. `LoginPage.jsx` renders the form and pulls two contexts:
   - `useAuth()` → receives the `login` function from `AuthContext`.
   - `useTheme()` → reads MUI’s theme context to decide which logo to show (dark vs light).

2. When the button is pressed, `handleSubmit`:
   - Validates the form locally.
   - Calls `await login(formState)` from the Auth context.
   - Displays success/error alerts based on the promise result.

---

## 2. Auth context talks to the API client

1. `AuthContext.login` (in `context/AuthContext.jsx`) expects `{ email, password }`:
   - Calls `api.login(email, password)` (defined in `src/api/client.js`).
   - After a successful POST, immediately calls `api.me()` to pull the canonical user payload and stores it in the context state (`setUser`).

2. The API client is a thin wrapper around `fetch` that:
   - Forces `credentials: 'include'` so browser cookies are sent/received.
   - Throws a rich `Error` if the HTTP response isn’t `2xx`, letting `LoginPage` surface an error message.

---

## 3. Express stack receives `POST /api/auth/login`

1. The browser POST hits `apps/nap-serv/src/app.js`:
   - `authRedis()` middleware looks at the path. Because `/auth/login` is on its bypass list, it skips token verification and does **not** populate `req.ctx` yet (no user is logged in).
   - The request is dispatched through `/api` to `src/apiRoutes.js`, which mounts `coreAuthRouter` at `/auth`.

2. `modules/core/apiRoutes/v1/auth.router.js` maps `POST /login` → `login` controller in `modules/core/controllers/auth.controller.js`.

---

## 4. `login` controller authenticates and builds server context

1. `login` uses `passport.authenticate('local')` with the strategy defined in `modules/core/utils/passport.js`. That strategy:
   - Looks up the user by email (`db('napUsers','admin').findOneBy`).
   - Verifies the bcrypt password hash.
   - Ensures the related tenant is active.

2. On success, the controller:
   - Loads RBAC policies for the user+tenant via `loadPoliciesForUserTenant`, calculates a permission hash (`calcPermHash`), and caches it in Redis under `perm:${user.id}:${tenant}`. This cache becomes part of the **server-side permission context** used later by `authRedis`.
   - Signs an access token (`signAccessToken`) and refresh token (`signRefreshToken`). The access token embeds `sub`, permission hash (`ph`), and other claims that `authRedis`/`req.ctx` will rely on for every subsequent request.
   - Calls `setAuthCookies(res, { accessToken, refreshToken })` to send httpOnly cookies (`auth_token`, `refresh_token`). This is how the browser session is persisted without exposing tokens to JavaScript.

3. The controller responds with `{ message: 'Logged in successfully' }`. There is no `req.ctx` yet for this request because login is an unauthenticated route; the context only appears after the browser sends the new cookies on the next request.

---

## 5. Auth context re-fetches `/api/auth/me`

1. Back in the client, `AuthContext.login` now calls `api.me()` to hydrate the user object.
2. This request **does** send the `auth_token` cookie, so `authRedis()` runs the full pipeline:
   - Verifies the JWT, extracts the user id, tenant code, schema, and role claims.
   - Pulls/refreshes the cached permissions from Redis (creating a canonical permission context).
   - Populates both `req.user` (legacy convenience) and **`req.ctx`** with:
     - `user_id`, `tenant_code`, `schema`, `perms`, and flags like `is_super_admin`.
     - These context fields become the authoritative auth state for every downstream controller.

3. The `/api/auth/me` handler (`auth.controller.js:159-187`) reads from contexts:
   - `const ctx = req.ctx || {};` provides tenant, system roles, and cached policy ETags populated upstream.
   - It falls back to `req.user` (set by `authRedis`) if it needs more details.
   - It may hit the database again to hydrate missing user fields (email, display name) and attaches them back to `req.user` for consistency.
   - The response `{ user, tenant, system_roles, tenant_roles, policy_etag }` is entirely derived from `req.ctx` + `req.user`.

4. `AuthProvider` receives the `me` payload, sets `user` in its React context, and any component calling `useAuth()` (including `LoginPage`, dashboards, etc.) can now read the authenticated user data.

---

## 6. Summary of contexts in play

| Context | Where it lives | Purpose in login flow |
| --- | --- | --- |
| React Query Provider | `src/main.jsx` | Global query cache (login doesn’t currently use it but it wraps the tree). |
| MUI Theme Context | `ThemeProvider` in `main.jsx` | Supplies theme info to `LoginPage` for visuals. |
| AuthContext (React) | `context/AuthContext.jsx` | Exposes `login`, `logout`, and the authenticated `user` state to components. |
| Fetch/API context (informal) | `src/api/client.js` | Centralizes credentials-included requests and error handling. |
| Passport Local Strategy | `modules/core/utils/passport.js` | Server-side “auth context” that knows how to validate a user against the DB. |
| Redis Permission Context | `auth.controller.js` + `authRedis.js` | Stores per-user capability snapshots so later requests know what a user can do. |
| Express `req.ctx` | Populated by `authRedis()` | Carries tenant/schema/user identifiers and permission info to every downstream handler, including `/api/auth/me`. |

That chain—from React contexts to Express `req.ctx`—is what lets the login route authenticate once and keep both the client and server synchronized about who the user is and what they’re allowed to do.
