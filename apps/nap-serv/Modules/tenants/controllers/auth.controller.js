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
import { generateAccessToken, generateRefreshToken } from '../auth/jwt.js';
import jwt from 'jsonwebtoken';

export const login = (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err || !user) return res.status(400).json({ message: info?.message || 'Login failed' });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('auth_token', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 15 * 60 * 1000
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({ message: 'Logged in successfully' });
  })(req, res, next);
};

export const refreshToken = (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ message: 'No refresh token' });

  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid refresh token' });

    const accessToken = generateAccessToken(decoded);
    res.cookie('auth_token', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 15 * 60 * 1000
    });

    res.json({ message: 'Access token refreshed' });
  });
};

export const logout = (req, res) => {
  res.clearCookie('auth_token');
  res.clearCookie('refresh_token');
  res.json({ message: 'Logged out successfully' });
};