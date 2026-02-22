/**
 * @file Auth controller — login, refresh, logout, me, check, changePassword per PRD §3.1.1
 * @module auth/controllers/authController
 *
 * Phase 2: Basic auth flow. RBAC permission loading and Redis caching
 * are stubbed — full implementation comes in Phase 3.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import bcrypt from 'bcrypt';
import passport from '../services/passportService.js';
import { signAccessToken, signRefreshToken, verifyRefresh } from '../services/tokenService.js';
import { setAuthCookies, clearAuthCookies } from '../../../lib/cookies.js';
import db from '../../../db/db.js';

/**
 * POST /api/auth/login — Authenticate with email/password
 */
export const login = (req, res, next) => {
  passport.authenticate('local', { session: false }, async (err, user, info) => {
    if (err || !user) {
      return res.status(400).json({ message: info?.message || 'Login failed' });
    }

    const _tenant = user._tenant;

    // Phase 3 will add RBAC permission loading and Redis caching here.
    // For now, ph is null (no permission hash).
    const ph = null;

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

    // Phase 3 will add RBAC permission reload here
    const ph = null;

    const accessToken = signAccessToken(user, { sub: user.id, ph });
    const refreshToken = signRefreshToken(user, { sub: user.id });

    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({ message: 'Access token refreshed' });
  } catch {
    return res.status(500).json({ message: 'Error refreshing token' });
  }
};

/**
 * POST /api/auth/logout — Clear cookies
 */
export const logout = async (req, res) => {
  if (req.cookies && !req.cookies.auth_token && !req.cookies.refresh_token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Phase 3 will add Redis permission cache invalidation here

  clearAuthCookies(res);
  return res.json({ message: 'Logged out successfully' });
};

/**
 * GET /api/auth/me — Return user context with tenant info
 *
 * Phase 2: Returns user identity + tenant. Phase 3 adds roles, permissions,
 * impersonation state.
 */
export const me = async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  // Look up tenant for full context
  let tenant = null;
  try {
    tenant = await db('tenants', 'admin').findById(user.tenant_id);
  } catch {
    // proceed with null tenant
  }

  // Strip sensitive fields
  const safeUser = {
    id: user.id,
    email: user.email,
    entity_type: user.entity_type,
    entity_id: user.entity_id,
    status: user.status,
    tenant_id: user.tenant_id,
  };

  const tenantContext = tenant
    ? {
        id: tenant.id,
        tenant_code: tenant.tenant_code,
        company: tenant.company,
        schema_name: tenant.schema_name,
        status: tenant.status,
        tier: tenant.tier,
        allowed_modules: tenant.allowed_modules,
      }
    : null;

  return res.json({
    user: safeUser,
    tenant: tenantContext,
    // Phase 3 will add: system_roles, tenant_roles, policy_etag, impersonation
  });
};

/**
 * GET /api/auth/check — Lightweight session validation
 */
export const check = (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  return res.status(200).json({ message: 'Token is valid' });
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
  return PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.msg);
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

  const failures = validatePasswordStrength(newPassword);
  if (failures.length) {
    return res.status(400).json({ message: `Password must contain ${failures.join(', ')}` });
  }

  try {
    const user = await db('napUsers', 'admin').findOneBy([{ id: userId }]);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) return res.status(403).json({ message: 'Current password is incorrect' });

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
    const password_hash = await bcrypt.hash(newPassword, rounds);

    // Use raw SQL — pg-schemata's update resets all ColumnSet columns to defaults
    const setClauses = ['password_hash = $/password_hash/'];
    const params = { password_hash, id: userId };

    // If user is 'invited', activate them on first password change
    if (user.status === 'invited') {
      setClauses.push("status = 'active'");
    }

    await db.none(`UPDATE admin.nap_users SET ${setClauses.join(', ')} WHERE id = $/id/`, params);

    return res.json({ message: 'Password changed successfully' });
  } catch {
    return res.status(500).json({ message: 'Error changing password' });
  }
};

export default { login, refresh, logout, me, check, changePassword };
