/**
 * @file Auth controller — login, refresh, logout, me, check per PRD §3.1.1
 * @module auth/controllers/authController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import bcrypt from 'bcrypt';
import passport from '../.././../auth/passportStrategy.js';
import { signAccessToken, signRefreshToken, verifyRefresh } from '../../../auth/jwt.js';
import { calcPermHash } from '../../../utils/permHash.js';
import { getRedis } from '../../../utils/redis.js';
import { setAuthCookies, clearAuthCookies } from '../../../auth/cookies.js';
import db from '../../../db/db.js';

/**
 * Build a full-access capability map for super_user users.
 * super_user has no schema-based policies — they get all module caps.
 */
const SUPER_USER_MODULES = [
  'tenants', 'projects', 'budgets', 'actual-costs', 'change-orders',
  'ap', 'ar', 'accounting', 'reports',
];

function buildSuperUserCaps() {
  const caps = {};
  for (const mod of SUPER_USER_MODULES) {
    caps[`${mod}::::full`] = 'full';
  }
  return caps;
}

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

    // super_user gets full access to all modules — they don't have schema-based policies
    if (user.role === 'super_user') {
      canon = { caps: buildSuperUserCaps() };
    } else {
      try {
        const { loadPoliciesForUserTenant } = await import('../../../utils/RbacPolicies.js');
        const caps = await loadPoliciesForUserTenant({ schemaName, userId: user.id });
        canon = { caps };
      } catch {
        canon = { caps: {} };
      }
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
            role: user.role,
            status: user.status,
          },
        }),
      );
    } catch {
      // Redis unavailable — still issue token; middleware will rebuild cache
    }

    const accessToken = signAccessToken(user, { sub: user.id, ph });
    const refreshToken = signRefreshToken(user, { sub: user.id });

    setAuthCookies(res, { accessToken, refreshToken });

    const forcePasswordChange = user.status === 'invited';
    return res.json({ message: 'Logged in successfully', forcePasswordChange });
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

    // Reload RBAC policies (super_user gets full caps automatically)
    let canon = { caps: {} };
    if (user.role === 'super_user') {
      canon = { caps: buildSuperUserCaps() };
    } else {
      try {
        const { loadPoliciesForUserTenant } = await import('../../../utils/RbacPolicies.js');
        const caps = await loadPoliciesForUserTenant({ schemaName, userId: user.id });
        canon = { caps };
      } catch {
        canon = { caps: {} };
      }
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
            role: user.role,
            status: user.status,
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
        user = { ...user, email: full.email, user_name: full.user_name, full_name: full.full_name, role: full.role, status: full.status };
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

  // Merge perms from req.user (populated by authRedis middleware) so the
  // client-side sidebar can filter nav items by capability.
  const perms = req.user?.perms || ctx.perms || { caps: {} };

  // Strip password_hash from response
  const { password_hash: _ph, ...safeUser } = user;

  return res.json({ user: { ...safeUser, perms }, tenant, system_roles, tenant_roles, policy_etag });
};

/**
 * GET /api/auth/check — Lightweight session validation
 */
export const check = (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  return res.status(200).json({ message: 'Token is valid', user: req.user });
};

/**
 * Password strength rules: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special.
 */
const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, msg: 'at least 8 characters' },
  { test: (p) => /[A-Z]/.test(p), msg: 'an uppercase letter' },
  { test: (p) => /[a-z]/.test(p), msg: 'a lowercase letter' },
  { test: (p) => /[0-9]/.test(p), msg: 'a digit' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), msg: 'a special character' },
];

function validatePasswordStrength(password) {
  const failures = PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.msg);
  return failures;
}

/**
 * POST /api/auth/change-password — Change the authenticated user's password
 */
export const changePassword = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'currentPassword and newPassword are required' });
  }

  // Validate strength
  const failures = validatePasswordStrength(newPassword);
  if (failures.length) {
    return res.status(400).json({ message: `Password must contain ${failures.join(', ')}` });
  }

  try {
    const user = await db('napUsers', 'admin').findOneBy([{ id: userId }]);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) return res.status(403).json({ message: 'Current password is incorrect' });

    // Hash new password and update
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
    const password_hash = await bcrypt.hash(newPassword, rounds);

    // Use raw SQL — pg-schemata's updateWhere doesn't handle partial DTOs
    const setClauses = ['password_hash = $/password_hash/'];
    const params = { password_hash, id: userId };

    // If user is 'invited', activate them on first password change
    if (user.status === 'invited') {
      setClauses.push("status = 'active'");
    }

    await db.none(
      `UPDATE admin.nap_users SET ${setClauses.join(', ')} WHERE id = $/id/`,
      params,
    );

    return res.json({ message: 'Password changed successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Error changing password' });
  }
};

export default { login, refresh, logout, me, check, changePassword };
