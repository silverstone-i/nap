/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('returns API health information', async () => {
    const response = await request(createApp()).get('/health').expect(200);

    const health = response.body as Record<string, unknown>;

    expect(health.status).toBe('ok');
    expect(typeof health.uptime).toBe('number');
    expect(Number.isNaN(Date.parse(health.timestamp as string))).toBe(false);
  });

  it('does not advertise the framework', async () => {
    const response = await request(createApp()).get('/health').expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('unknown routes', () => {
  it('return JSON 404, not the Express HTML error page', async () => {
    const response = await request(createApp())
      .get('/no-such-route')
      .expect(404);

    expect(response.body).toEqual({ error: 'Not found' });
  });
});
