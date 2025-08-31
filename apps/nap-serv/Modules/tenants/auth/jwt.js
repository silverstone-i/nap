'use strict';

import { signAccessToken, signRefreshToken } from '../../core/utils/jwt.js';

export function generateAccessToken(user) {
  return signAccessToken(user);
}

export function generateRefreshToken(user) {
  return signRefreshToken(user);
}

export default { generateAccessToken, generateRefreshToken };
