import { jest } from '@jest/globals';

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
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}