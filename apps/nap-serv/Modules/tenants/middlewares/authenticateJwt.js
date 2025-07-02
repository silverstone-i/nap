'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import jwt from 'jsonwebtoken';

export function authenticateJwt(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Unauthorized' });

    req.user = decoded;

    if (decoded.role === 'super_admin') {
      req.schema = req.headers['x-tenant-schema']?.toLowerCase() || req.params?.schema?.toLowerCase() || 'admin';
    } else {
      req.schema = decoded.schema_name?.toLowerCase() || decoded.tenant_code?.toLowerCase();
    }

    next();
  });
}
