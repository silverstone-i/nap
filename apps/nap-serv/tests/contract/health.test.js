/**
 * @file Contract test for health endpoint
 * @module nap-serv/tests/contract/health
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('GET /api/health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });
});

describe('GET /unknown-route', () => {
  it('should return 401 for unauthenticated requests to unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');

    // Auth middleware intercepts before the 404 handler
    expect(res.status).toBe(401);
  });
});
