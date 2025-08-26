import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticateJwt } from '../../../../modules/tenants/middlewares/authenticateJwt';

vi.mock('jsonwebtoken');

describe('authenticateJwt middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  it('should call next with decoded token if valid JWT is present', () => {
    const mockToken = 'valid.token.here';
    const decoded = { email: 'test@example.com', tenant_code: 'TEST' };
    req.headers.authorization = `Bearer ${mockToken}`;
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, decoded));

    authenticateJwt(req, res, () => {
      expect(req.user).toEqual(decoded);
      expect(next).toHaveBeenCalled();
    });
  });

  it('should return 401 if no Authorization header is present', () => {
    authenticateJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if JWT verification fails', () => {
    const mockToken = 'invalid.token';
    req.headers.authorization = `Bearer ${mockToken}`;
    jwt.verify.mockImplementation((token, secret, callback) => callback(new Error('Invalid token'), null));

    authenticateJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });
});