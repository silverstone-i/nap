/**
 * @file Auth controller — login, refresh, logout, me, check per PRD §3.1.1
 * @module auth/controllers/authController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import passport from '../.././../auth/passportStrategy.js';
import { signAccessToken, signRefreshToken, verifyRefresh } from '../../../auth/jwt.js';
import { calcPermHash } from '../../../utils/permHash.js';
import { getRedis } from '../../../utils/redis.js';
import { setAuthCookies, clearAuthCookies } from '../../../auth/cookies.js';
import db from '../../../db/db.js';

/**
 * POST /api/auth/login — Authenticate with email/password
 */
export const login = (req, res, next) => {
  passport.authenticate('local', { session: false }, async (err, user, info) => {
    if (err || !user) {
      return res.status(400).json({ message: info?.message || 'Login failed' });
    }

    const schemaName = user.tenant_code?.toLowerCase?.();
    let canon = { caps: {} };
    try {
      const { loadPoliciesForUserTenant } = await import('../../../utils/RbacPolicies.js');
      const caps = await loadPoliciesForUserTenant({ schemaName, userId: user.id });
      canon = { caps };
    } catch {
      canon = { caps: {} };
    }

    const ph = calcPermHash(canon);

    // Cache permissions in Redis
    try {
      const redis = await getRedis();
      const permKey = `perm:${user.id}:${schemaName}`;
      await redis.set(
        permKey,
        JSON.stringify({
          hash: ph,
          version: 1,
          updatedAt: Date.now(),
          perms: canon,
          user: {
            id: user.id,
            tenant_code: user.tenant_code,
            email: user.email,
            user_name: user.user_name,
          },
        }),
      );
    } catch {
      // Redis unavailable — still issue token; middleware will rebuild cache
    }

    const accessToken = signAccessToken(user, { sub: user.id, ph });
    const refreshToken = signRefreshToken(user, { sub: user.id });

    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({ message: 'Logged in successfully' });
  })(req, res, next);
};

/**
 * POST /api/auth/refresh — Full token rotation
 */
export const refresh = async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ message: 'No refresh token' });

  let decoded;
  try {
    decoded = verifyRefresh(token);
  } catch {
    return res.status(403).json({ message: 'Invalid refresh token' });
  }

  try {
    const user = await db('napUsers', 'admin').findOneBy([{ id: decoded.sub }]);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const schemaName = user.tenant_code?.toLowerCase?.();

    // Reload RBAC policies
    let canon = { caps: {} };
    try {
      const { loadPoliciesForUserTenant } = await import('../../../utils/RbacPolicies.js');
      const caps = await loadPoliciesForUserTenant({ schemaName, userId: user.id });
      canon = { caps };
    } catch {
      canon = { caps: {} };
    }

    const ph = calcPermHash(canon);

    // Update Redis cache
    try {
      const redis = await getRedis();
      const permKey = `perm:${user.id}:${schemaName}`;
      await redis.set(
        permKey,
        JSON.stringify({
          hash: ph,
          version: 1,
          updatedAt: Date.now(),
          perms: canon,
          user: {
            id: user.id,
            tenant_code: user.tenant_code,
            email: user.email,
            user_name: user.user_name,
          },
        }),
      );
    } catch {
      // ignore redis issues
    }

    const accessToken = signAccessToken(user, { sub: user.id, ph });
    const refreshToken = signRefreshToken(user, { sub: user.id });

    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({ message: 'Access token refreshed' });
  } catch {
    return res.status(500).json({ message: 'Error refreshing token' });
  }
};

/**
 * POST /api/auth/logout — Clear cookies, invalidate Redis cache
 */
export const logout = async (req, res) => {
  if (req.cookies && !req.cookies.auth_token && !req.cookies.refresh_token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Best-effort Redis invalidation
  if (req.user?.id && req.user?.tenant_code) {
    try {
      const redis = await getRedis();
      await redis.del(`perm:${req.user.id}:${req.user.tenant_code.toLowerCase()}`);
    } catch {
      // ignore
    }
  }

  clearAuthCookies(res);
  return res.json({ message: 'Logged out successfully' });
};

/**
 * GET /api/auth/me — Return user context with tenant, roles, permissions
 */
export const me = async (req, res) => {
  const ctx = req.ctx || {};
  let user = ctx.user || req.user || null;

  // Hydrate user from DB if minimal JWT mode (no email in token)
  if (user && !user.email && user.id) {
    try {
      const full = await db('napUsers', 'admin').findOneBy([{ id: user.id }]);
      if (full) {
        user = { ...user, email: full.email, user_name: full.user_name, full_name: full.full_name, role: full.role };
        req.user = user;
      }
    } catch {
      // return minimal user
    }
  }

  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  const tenant = ctx.tenant || null;
  const system_roles = ctx.system_roles || [];
  const tenant_roles = ctx.tenant_roles || [];
  const policy_etag = ctx.policy_etag || null;

  // Strip password_hash from response
  const { password_hash: _ph, ...safeUser } = user;

  return res.json({ user: safeUser, tenant, system_roles, tenant_roles, policy_etag });
};

/**
 * GET /api/auth/check — Lightweight session validation
 */
export const check = (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  return res.status(200).json({ message: 'Token is valid', user: req.user });
};

export default { login, refresh, logout, me, check };
