'use strict';

import jwt from 'jsonwebtoken';

export function auth(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Unauthorized' });

    // Normalize into req.auth
    const roles = decoded?.roles || [];
    req.auth = {
      sub: decoded.id || decoded.sub || null,
      email: decoded.email,
      tenant_code: decoded.tenant_code,
      schema: decoded.schema_name?.toLowerCase?.() || decoded.tenant_code?.toLowerCase?.() || null,
      roles,
      // assumption fields if present
      assumed: decoded.assumed || false,
      actor: decoded.actor || null,
      on_behalf_of: decoded.on_behalf_of || null,
    };

    next();
  });
}

export default auth;
