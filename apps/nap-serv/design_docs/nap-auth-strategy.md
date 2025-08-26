
# Authentication & Authorization Strategy for `nap-serv` and `nap-client`

## Overview

This document outlines the authentication and authorization strategy used for the `nap-serv` backend and the `nap-client` frontend.

---

## 🔐 Requirements Summary

### nap-client (React App)
- Needs to know user's `role` to configure the UI.
- Must remain logged in while active.
- Auto-logout after 15 minutes of inactivity.

### nap-serve (Express.js API)
- Authenticates via `email` and `password`.
- Requires `email`, `user_name`, `tenant_code`, `role`, and `schema` in middleware.
- Authorizes routes based on `role`.

---

## 🧩 JWT Token Structure

### Access Token
- **Lifetime**: 15 minutes
- **Stored in**: `HttpOnly`, `Secure`, `SameSite=Strict` cookie (`auth_token`)
- **Used for**: API request authentication

### Refresh Token
- **Lifetime**: 7 days (sliding expiration)
- **Stored in**: `HttpOnly`, `Secure`, `SameSite=Strict` cookie (`refresh_token`)
- **Used for**: Getting new access tokens

---

## 🔄 Inactivity Timeout (15 Minutes)

- **Short-lived access tokens** expire after 15 min.
- **Refresh token** extends session if activity is detected.
- React app sends periodic background requests (e.g., `/auth/refresh`) during use.
- If no request occurs, user must re-authenticate after expiration.

---

## ⚙️ Backend Middleware (nap-serve)

```js
// authenticateJwt.js
export function authenticateJwt(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  jwt.verify(token, ACCESS_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Session expired' });

    req.user = decoded;
    req.tenantId = decoded.tenant_code;
    req.schema = decoded.tenant_code.toLowerCase();
    next();
  });
}
```

---

## 📩 `/auth/user` Endpoint (for React Role Access)

Returns user profile info safely for UI rendering:

```js
router.get('/auth/user', authenticateJwt, (req, res) => {
  const { email, user_name, tenant_code, role } = req.user;
  res.json({ email, user_name, tenant_code, role });
});
```

---

## ⚛️ Frontend (nap-client) Flow

1. User logs in → `nap-serve` sets cookies (`auth_token`, `refresh_token`)
2. React calls `/auth/user` to get user info
3. App shows UI based on `role`
4. Every 5–10 min, React calls `/auth/refresh` if user is active
5. After 15 min of inactivity → access token expires → user is logged out

---

## ✅ Security Summary

| Feature              | Strategy |
|----------------------|----------|
| Token storage        | Secure, `HttpOnly` cookies |
| Access token expiry  | 15 minutes |
| Refresh token expiry | 7 days (sliding) |
| Frontend access      | Exposes safe data via `/auth/user` |
| Logout               | Clears cookies via `/auth/logout` |
