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
import { db } from '../../../src/db/db.js';

export const login = (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err || !user) {
      return res.status(400).json({ message: info?.message || 'Login failed' });
    }

    const isTest = process.env.NODE_ENV === 'test';

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('auth_token', accessToken, {
      httpOnly: true,
      secure: !isTest,
      sameSite: 'Strict',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: !isTest,
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ message: 'Logged in successfully' });
  })(req, res, next);
};

export const refreshToken = async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ message: 'No refresh token' });

  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid refresh token' });

    const isTest = process.env.NODE_ENV === 'test';

    try {
      const user = await db('napUsers', 'admin').findOneBy([{ email: decoded.email }]);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const newAccessToken = generateAccessToken(user);
      const newRefreshToken = generateRefreshToken(user); // 🔁 Token rotation

      res.cookie('auth_token', newAccessToken, {
        httpOnly: true,
        secure: !isTest,
        sameSite: 'Strict',
        maxAge: 15 * 60 * 1000,
      });

      res.cookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: !isTest,
        sameSite: 'Strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({ message: 'Access token refreshed' });
    } catch (err) {
      console.error('Error refreshing token:', err);
      return res.status(500).json({ message: 'Error refreshing token' });
    }
  });
};

export const logout = (req, res) => {
  res.clearCookie('auth_token');
  res.clearCookie('refresh_token');
  res.json({ message: 'Logged out successfully' });
};

// Check token validity handler
export const checkToken = (req, res) => {
  res.status(200).json({ message: 'Token is valid', user: req.user });
};
