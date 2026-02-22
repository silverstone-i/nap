/**
 * @file Unit tests for JWT token service
 * @module tests/unit/tokenService
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

// Set secrets before importing tokenService
beforeAll(() => {
  process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-32chars-long!!';
  process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-32chars-long!';
});

const { signAccessToken, signRefreshToken, verifyAccess, verifyRefresh } = await import(
  '../../src/modules/auth/services/tokenService.js'
);

describe('tokenService', () => {
  const mockUser = { id: '550e8400-e29b-41d4-a716-446655440000' };

  describe('signAccessToken', () => {
    test('returns a signed JWT string', () => {
      const token = signAccessToken(mockUser);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    test('includes sub claim from user.id', () => {
      const token = signAccessToken(mockUser);
      const decoded = jwt.decode(token);
      expect(decoded.sub).toBe(mockUser.id);
    });

    test('includes null ph by default', () => {
      const token = signAccessToken(mockUser);
      const decoded = jwt.decode(token);
      expect(decoded.ph).toBeNull();
    });

    test('includes custom ph when provided', () => {
      const token = signAccessToken(mockUser, { ph: 'abc123hash' });
      const decoded = jwt.decode(token);
      expect(decoded.ph).toBe('abc123hash');
    });

    test('includes iss and aud claims', () => {
      const token = signAccessToken(mockUser);
      const decoded = jwt.decode(token);
      expect(decoded.iss).toBe('nap-serv');
      expect(decoded.aud).toBe('nap-serv-api');
    });

    test('expires in 15 minutes', () => {
      const token = signAccessToken(mockUser);
      const decoded = jwt.decode(token);
      // 15 minutes = 900 seconds
      expect(decoded.exp - decoded.iat).toBe(900);
    });
  });

  describe('signRefreshToken', () => {
    test('returns a signed JWT string', () => {
      const token = signRefreshToken(mockUser);
      expect(typeof token).toBe('string');
    });

    test('includes sub claim, no ph', () => {
      const token = signRefreshToken(mockUser);
      const decoded = jwt.decode(token);
      expect(decoded.sub).toBe(mockUser.id);
      expect(decoded.ph).toBeUndefined();
    });

    test('expires in 7 days', () => {
      const token = signRefreshToken(mockUser);
      const decoded = jwt.decode(token);
      // 7 days = 604800 seconds
      expect(decoded.exp - decoded.iat).toBe(604800);
    });
  });

  describe('verifyAccess', () => {
    test('returns decoded payload for valid token', () => {
      const token = signAccessToken(mockUser, { ph: 'hash123' });
      const decoded = verifyAccess(token);
      expect(decoded.sub).toBe(mockUser.id);
      expect(decoded.ph).toBe('hash123');
    });

    test('throws for invalid token', () => {
      expect(() => verifyAccess('invalid.token.here')).toThrow();
    });

    test('throws for refresh token (wrong secret)', () => {
      const token = signRefreshToken(mockUser);
      expect(() => verifyAccess(token)).toThrow();
    });
  });

  describe('verifyRefresh', () => {
    test('returns decoded payload for valid refresh token', () => {
      const token = signRefreshToken(mockUser);
      const decoded = verifyRefresh(token);
      expect(decoded.sub).toBe(mockUser.id);
    });

    test('throws for access token (wrong secret)', () => {
      const token = signAccessToken(mockUser);
      expect(() => verifyRefresh(token)).toThrow();
    });
  });
});
