/**
 * @file Unit tests for JWT sign/verify utilities
 * @module tests/unit/jwt
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Set required env vars before importing jwt module
beforeAll(() => {
  process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-key-for-jwt-unit-tests';
  process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-key-for-jwt-unit-tests';
  process.env.NODE_ENV = 'test';
});

describe('JWT utilities', () => {
  let signAccessToken, signRefreshToken, verifyAccess, verifyRefresh;

  beforeAll(async () => {
    const mod = await import('../../src/auth/jwt.js');
    signAccessToken = mod.signAccessToken;
    signRefreshToken = mod.signRefreshToken;
    verifyAccess = mod.verifyAccess;
    verifyRefresh = mod.verifyRefresh;
  });

  const mockUser = { id: '550e8400-e29b-41d4-a716-446655440000' };

  describe('signAccessToken', () => {
    it('should return a JWT string', () => {
      const token = signAccessToken(mockUser);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include sub claim from user.id', () => {
      const token = signAccessToken(mockUser);
      const decoded = verifyAccess(token);
      expect(decoded.sub).toBe(mockUser.id);
    });

    it('should include ph claim when provided via extras', () => {
      const token = signAccessToken(mockUser, { ph: 'abc123hash' });
      const decoded = verifyAccess(token);
      expect(decoded.ph).toBe('abc123hash');
    });

    it('should include iss and aud claims', () => {
      const token = signAccessToken(mockUser);
      const decoded = verifyAccess(token);
      expect(decoded.iss).toBe('nap-serv');
      expect(decoded.aud).toBe('nap-serv-api');
    });

    it('should use extras.sub over user.id when provided', () => {
      const token = signAccessToken(mockUser, { sub: 'override-id' });
      const decoded = verifyAccess(token);
      expect(decoded.sub).toBe('override-id');
    });
  });

  describe('signRefreshToken', () => {
    it('should return a JWT string', () => {
      const token = signRefreshToken(mockUser);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include sub claim', () => {
      const token = signRefreshToken(mockUser);
      const decoded = verifyRefresh(token);
      expect(decoded.sub).toBe(mockUser.id);
    });

    it('should NOT include ph claim', () => {
      const token = signRefreshToken(mockUser);
      const decoded = verifyRefresh(token);
      expect(decoded.ph).toBeUndefined();
    });
  });

  describe('verifyAccess', () => {
    it('should decode a valid access token', () => {
      const token = signAccessToken(mockUser);
      const decoded = verifyAccess(token);
      expect(decoded.sub).toBe(mockUser.id);
    });

    it('should throw for an invalid token', () => {
      expect(() => verifyAccess('invalid.token.here')).toThrow();
    });

    it('should throw for a refresh token verified as access', () => {
      const token = signRefreshToken(mockUser);
      // Refresh tokens are signed with a different secret, so verification should fail
      expect(() => verifyAccess(token)).toThrow();
    });
  });

  describe('verifyRefresh', () => {
    it('should decode a valid refresh token', () => {
      const token = signRefreshToken(mockUser);
      const decoded = verifyRefresh(token);
      expect(decoded.sub).toBe(mockUser.id);
    });

    it('should throw for an invalid token', () => {
      expect(() => verifyRefresh('not.a.real.token')).toThrow();
    });
  });
});
