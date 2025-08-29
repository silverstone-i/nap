'use strict';

import { signAccessToken } from '../utils/jwt.js';
import { setAuthCookies } from '../utils/cookies.js';

export async function assumeTenant(req, res) {
  const actor = req.auth?.sub || req.user?.id || null;
  const { tenant_code, reason } = req.body || {};
  if (!actor || !tenant_code) return res.status(400).json({ error: 'tenant_code required' });

  // Issue a short-lived access token with assumption claims
  const token = signAccessToken(
    { id: actor, email: req.user?.email, user_name: req.user?.user_name, tenant_code },
    { assumed: true, actor, on_behalf_of: tenant_code },
  );

  setAuthCookies(res, { accessToken: token, refreshToken: req.cookies?.refresh_token || '' });
  res.json({ message: 'Assumed tenant', reason: reason || null });
}

export async function exitAssumption(req, res) {
  const user = req.user || {};
  const token = signAccessToken(user, { assumed: false, actor: null, on_behalf_of: null });
  setAuthCookies(res, { accessToken: token, refreshToken: req.cookies?.refresh_token || '' });
  res.json({ message: 'Exited assumption' });
}

export default { assumeTenant, exitAssumption };
