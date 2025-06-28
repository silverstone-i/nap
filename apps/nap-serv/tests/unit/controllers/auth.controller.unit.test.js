import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fullAuthController from '../../../modules/tenants/controllers/auth.controller.js';
let authController;
import * as jwtUtils from '../../../modules/tenants/auth/jwt.js';
vi.mock('jsonwebtoken', async () => {
  const actual = await vi.importActual('jsonwebtoken');
  return {
    ...actual,
    verify: vi.fn()
  };
});
import * as jwt from 'jsonwebtoken';
import * as dbModule from '../../../src/db/db.js';
vi.mock('../../../modules/tenants/auth/jwt.js', () => ({
  generateAccessToken: vi.fn(() => 'access'),
  generateRefreshToken: vi.fn(() => 'refresh'),
}));


const mockRes = () => {
  const res = {};
  res.cookie = vi.fn(); // ensure cookie is a mocked function
  res.clearCookie = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('auth.controller.js', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login()', () => {
    it('should respond with cookies and message on success', async () => {
      // Mock passport manually or inject mock middleware behavior
    });

    it('should return 400 on failed login', async () => {
      // Simulate passport returning no user
    });
  });

  describe('refreshToken()', () => {
    let res, req;

    beforeEach(async () => {
      vi.restoreAllMocks();
      req = { cookies: { refresh_token: 'valid.token' } };

      vi.spyOn(dbModule, 'db').mockImplementation((model, schema) => {
        if (model === 'napUsers' && (schema === 'admin' || schema === 'ABC123')) {
          return {
            findOneBy: vi.fn().mockResolvedValue({
              id: 1,
              email: 'test@example.com',
              user_name: 'Test User',
              tenant_code: 'ABC123',
              role: 'admin',
            }),
          };
        }
        return {};
      });

      const controllerModule = await import('../../../modules/tenants/controllers/auth.controller.js');
      authController = controllerModule.refreshToken;
      res = mockRes();
    });

    it('should return 401 if no refresh token', async () => {
      req.cookies = {};
      res = mockRes();
      await authController(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 if token is invalid', async () => {
      jwt.verify.mockImplementation((_, __, cb) => cb(new Error('bad'), null));
      res = mockRes();
      await authController(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 if user not found', async () => {
      jwt.verify.mockImplementationOnce((_, __, cb) => cb(null, { email: 'test@example.com' }));
      const dbMock = { findOneBy: vi.fn().mockResolvedValue(null) };
      vi.spyOn(dbModule, 'db').mockReturnValue(dbMock);
      res = mockRes();

      await authController(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('logout()', () => {
    it('should clear cookies and respond', () => {
      const req = {}, res = mockRes();
      fullAuthController.logout(req, res);
      expect(res.clearCookie).toHaveBeenCalledWith('auth_token');
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token');
      expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
    });
  });

  describe('checkToken()', () => {
    it('should respond with 200 and user info', () => {
      const req = { user: { id: 1 } }, res = mockRes();
      fullAuthController.checkToken(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Token is valid', user: { id: 1 } });
    });
  });
});