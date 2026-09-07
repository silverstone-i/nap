/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiErrorSchema, healthResponseSchema } from '@nap/shared';
import type { z } from 'zod';
import { correlation } from '../../src/middleware/correlation.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { logger } from '../../src/util/logger.js';
import { sendContract } from '../../src/util/sendContract.js';

/**
 * Does: Builds a bare app whose one route sends the given value through
 * sendContract under the health schema.
 * Called by: each test in this file.
 */
function createTestApp(
  value: z.input<typeof healthResponseSchema>,
  status?: number
) {
  return express()
    .use(correlation)
    .get('/', (_request, response) => {
      sendContract(response, healthResponseSchema, value, status);
    })
    .use(errorHandler);
}

beforeEach(() => {
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it('writes a body that satisfies its contract with the given status', async () => {
  const body = { version: 1, data: { status: 'ok' } } as const;
  const response = await request(createTestApp(body, 201)).get('/');
  expect(response.status).toBe(201);
  expect(response.body).toEqual(body);
});
it('answers with a generic 500 when a body violates its contract', async () => {
  // The cast bypasses the compile-time check on purpose: the test proves the
  // runtime check catches a body the types would have refused.
  const violating = {
    version: 1,
    data: { status: 'ok', host: 'private' },
  } as unknown as z.input<typeof healthResponseSchema>;
  const response = await request(createTestApp(violating)).get('/');
  expect(response.status).toBe(500);
  expect(apiErrorSchema.parse(response.body).code).toBe('INTERNAL_ERROR');
  expect(response.text).not.toContain('private');
  expect(response.text).not.toContain('contract');
  expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  expect(logger.error).toHaveBeenCalledTimes(1);
});
