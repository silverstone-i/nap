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

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

export const generateAccessToken = user => {
  return jwt.sign(
    {
      email: user.email,
      user_name: user.user_name,
      tenant_code: user.tenant_code,
      role: user.role,
      schema_name: user.schema_name?.toLowerCase() || user.tenant_code?.toLowerCase() || null,
      enable_match_logging: process.env.ENABLE_MATCH_LOGGING === 'true' ? true : false,
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: '15m' }
  );
};

export const generateRefreshToken = user => {
  return jwt.sign(
    {
      email: user.email,
    },
    REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );
};
