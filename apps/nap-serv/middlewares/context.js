'use strict';

// Minimal context: expose user and basic role flags; do not hit DB.
export async function context(req, res, next) {
  try {
    const auth = req.auth || req.user || null;
    const user = req.user || auth || null;

    const roles = (auth?.roles || []).map((x) => x?.toLowerCase?.()).filter(Boolean);
    const role = auth?.role?.toLowerCase?.();
    const is_superadmin = roles.includes('superadmin') || role === 'superadmin';
    const is_admin = roles.includes('admin') || role === 'admin';

    req.ctx = {
      ...(req.ctx || {}),
      user,
      is_superadmin,
      is_admin,
    };

    return next();
  } catch {
    return next();
  }
}

export default context;
