/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiErrorSchema } from '@nap/shared';
import { jsonBody } from '../../src/middleware/jsonBody.js';
import { validateBody } from '../../src/middleware/validateBody.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { logger } from '../../src/util/logger.js';

const schema = z.strictObject({
  name: z
    .string()
    .min(3)
    .regex(/^[a-z]+$/),
  items: z.array(z.strictObject({ qty: z.int().positive() })),
});
const received = vi.fn();

/**
 * Does: Builds a bare app with the real body parser, the validator under test,
 * a handler that records its body, and the real error handler.
 * Called by: each test in this file.
 */
function createTestApp() {
  return express()
    .use(jsonBody)
    .post('/', validateBody(schema), (request, response) => {
      received(request.body);
      response.status(204).end();
    })
    .use(errorHandler);
}

beforeEach(() => {
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it('passes an accepted body to the handler', async () => {
  const body = { name: 'abc', items: [{ qty: 1 }] };
  const response = await request(createTestApp()).post('/').send(body);
  expect(response.status).toBe(204);
  expect(received).toHaveBeenCalledWith(body);
});
it('refuses an invalid body with messages keyed by dotted field path', async () => {
  const response = await request(createTestApp())
    .post('/')
    .send({ name: 'A1', items: [{ qty: 0, extra: true }], extra: true });
  expect(response.status).toBe(400);
  const error = apiErrorSchema.parse(response.body);
  expect(error.code).toBe('INVALID_INPUT');
  expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual([
    '',
    'items.0',
    'items.0.qty',
    'name',
  ]);
  expect(error.fieldErrors?.name).toHaveLength(2);
  expect(logger.error).not.toHaveBeenCalled();
});
it('never echoes a submitted value and refuses a missing body', async () => {
  const app = createTestApp();
  const response = await request(app)
    .post('/')
    .send({ name: 'private-value', items: 'private-list' });
  expect(response.status).toBe(400);
  expect(response.text).not.toContain('private');
  const empty = await request(app).post('/');
  expect(empty.status).toBe(400);
  expect(apiErrorSchema.parse(empty.body).fieldErrors).toHaveProperty('');
});
