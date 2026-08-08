/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/app.js';

// No initDb() in this file: these requests must resolve before any handler
// reaches getDb(), proving createApp still works without a database
// (RULES/api-server.md).
describe('auth routes without a database', () => {
  it('keeps /health answering', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>).status).toBe('ok');
  });

  it('rejects an invalid login payload with 400 before touching the db', async () => {
    const res = await request(createApp())
      .post('/api/auth/v1/login')
      .send({ email: 'not-an-email', password: '' });

    expect(res.status).toBe(400);
    expect((res.body as Record<string, unknown>).error).toBe(
      'Invalid request body'
    );
  });

  it('refuses a missing-body login with 400', async () => {
    const res = await request(createApp()).post('/api/auth/v1/login');
    expect(res.status).toBe(400);
  });

  it('401s every protected route without a token', async () => {
    const app = createApp();
    const protectedCalls = [
      request(app).post('/api/auth/v1/logout'),
      request(app).post('/api/auth/v1/switch-tenant'),
      request(app).put('/api/auth/v1/password'),
      request(app).put('/api/auth/v1/idle-window'),
    ];
    for (const call of protectedCalls) {
      const res = await call;
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    }
  });

  it('refuses a refresh with no cookie as an invalid session', async () => {
    const res = await request(createApp()).post('/api/auth/v1/refresh');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid session' });
  });
});
