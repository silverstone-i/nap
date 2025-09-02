'use strict';

import jwt from 'jsonwebtoken';

function toLower(v) {
  return v?.toLowerCase?.() || null;
}

function rolesFrom(decoded) {
  const arr = Array.isArray(decoded?.roles) ? decoded.roles : [];
  return arr.map((r) => r?.toLowerCase?.()).filter(Boolean);
}

function hasRole(decoded, role) {
  const r = role.toLowerCase();
  const list = rolesFrom(decoded);
  if (list.includes(r)) return true;
  const single = decoded?.role?.toLowerCase?.();
  return single === r;
}

function isPublicPath(pathname) {
  // Treat any route ending with /auth/login, /auth/refresh as public (any module/version)
  // Also allow GET /auth/me for convenience in some flows; logout should still require auth
  return /\/auth\/(login|refresh)\b/.test(pathname) || /\/auth\/me\b/.test(pathname);
}

export function requestContext(req, res, next) {
  try {
    // Allow public endpoints without a token
    const publicRoute = isPublicPath(req.path || '');

    const token = req.cookies?.auth_token;
    if (!token) {
      if (publicRoute) {
        req.ctx = req.ctx || {};
        return next();
      }
      return res.status(401).json({ message: 'Unauthorized' });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        if (publicRoute) return next();
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Derive base fields from token
      const roles = rolesFrom(decoded);
      const is_super_admin = hasRole(decoded, 'super_admin');
      const is_admin = hasRole(decoded, 'admin');

      // Tenant resolution with optional super_admin override header
      let tenant_code = decoded?.tenant_code || null;
      const override = req.headers['x-tenant-code'];
      if (is_super_admin && typeof override === 'string' && override.trim()) {
        tenant_code = override.trim();
      }

      const schema = toLower(decoded?.schema_name) || toLower(tenant_code);

      // Single source of truth context
      req.ctx = {
        ...(req.ctx || {}),
        user_id: decoded?.id || decoded?.sub || null,
        email: decoded?.email || null,
        tenant_code: tenant_code,
        schema,
        roles,
        is_super_admin,
        is_admin,
      };

      // // Optionally expose raw decoded and legacy req.user for now (can be removed later)
      // req.auth = decoded;
      // req.user = { ...decoded };

      next();
    });
  } catch (e) {
    next(e);
  }
}

export default requestContext;
