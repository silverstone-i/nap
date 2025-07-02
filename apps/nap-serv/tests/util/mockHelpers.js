import { vi } from 'vitest';

export function mockReq(overrides = {}) {
  return {
    params: {},
    body: {},
    user: { email: 'test@example.com' },
    ...overrides,
  };
}

export function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}
