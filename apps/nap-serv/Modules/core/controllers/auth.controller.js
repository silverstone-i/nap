'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import passport from '../auth/passport.js';
import { signAccessToken, signRefreshToken } from '../utils/jwt.js';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies.js';
import jwt from 'jsonwebtoken';
import { db } from '../../../src/db/db.js';

export const login = (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err || !user) {
      return res.status(400).json({ message: info?.message || 'Login failed' });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({ message: 'Logged in successfully' });
  })(req, res, next);
};

export const refresh = async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ message: 'No refresh token' });

  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid refresh token' });

    try {
      const user = await db('napUsers', 'admin').findOneBy([{ email: decoded.email }]);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const newAccessToken = signAccessToken(user);
      const newRefreshToken = signRefreshToken(user); // rotate

      setAuthCookies(res, { accessToken: newAccessToken, refreshToken: newRefreshToken });

      res.json({ message: 'Access token refreshed' });
    } catch {
      return res.status(500).json({ message: 'Error refreshing token' });
    }
  });
};

export const logout = (req, res) => {
  clearAuthCookies(res);
  res.json({ message: 'Logged out successfully' });
};

export const me = (req, res) => {
  const ctx = req.ctx || {};
  const user = ctx.user || req.auth || req.user || null;
  const tenant = ctx.tenant || null;
  const system_roles = ctx.system_roles || user?.system_roles || [];
  const tenant_roles = ctx.tenant_roles || [];
  const policy_etag = ctx.policy_etag || null;
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  res.json({ user, tenant, system_roles, tenant_roles, policy_etag });
};

export default { login, refresh, logout, me };
