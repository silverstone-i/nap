'use strict';

// Legacy shim re-exporting core token utilities for tests
export { signAccessToken as generateAccessToken, signRefreshToken as generateRefreshToken } from '../../../Modules/core/utils/jwt.js';
