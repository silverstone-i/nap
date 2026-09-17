/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('API', () => {
  it('reports process liveness without cache or framework disclosure', async () => {
    const response = await request(createApp()).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ version: 1, data: { status: 'ok' } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns a safe JSON response for unknown routes', async () => {
    for (const path of ['/missing', '/health/ready']) {
      const response = await request(createApp()).get(path);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        version: 1,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      expect(response.headers['x-powered-by']).toBeUndefined();
    }
  });
});
