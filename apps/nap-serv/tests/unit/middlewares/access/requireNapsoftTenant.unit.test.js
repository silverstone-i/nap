import 'dotenv/config';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { requireNapsoftTenant } from '../../../../middlewares/access/requireNapsoftTenant.js';

describe('requireNapsoftTenant middleware', () => {
  beforeAll(() => {
    process.env.NAPSOFT_TENANT = 'NAPSOFT';
  });

  const next = vi.fn();

  const createMockReq = (tenantCode = 'NAPSOFT') => ({
    user: { tenant_code: tenantCode },
  });

  const createMockRes = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  });

  it('should allow request if tenant_code is NAPSOFT', () => {
    const req = createMockReq('NAPSOFT');
    const res = createMockRes();

    requireNapsoftTenant(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should block request if tenant_code is not NAPSOFT', () => {
    const req = createMockReq('AST');
    const res = createMockRes();

    requireNapsoftTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Access denied: not a NapSoft user.',
    });
  });

  it('should block request if user is missing', () => {
    const req = { user: undefined };
    const res = createMockRes();

    requireNapsoftTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Access denied: not a NapSoft user.',
    });
  });
});