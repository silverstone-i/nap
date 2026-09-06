/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiErrorSchema, healthResponseSchema } from '@nap/shared';
import { createApp } from '../../src/app.js';
import { logger, createDatabaseLogger } from '../../src/util/logger.js';
import { requestContext } from '../../src/util/requestContext.js';

beforeEach(() => {
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it.each(['get', 'post'] as const)(
  'returns a correlated safe 404 for %s',
  async method => {
    const response = await request(createApp())[method](
      '/missing?secret=private'
    );
    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(response.body).code).toBe('NOT_FOUND');
    expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.headers).not.toHaveProperty('x-powered-by');
    expect(logger.error).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain(
      'private'
    );
  }
);
it('validates both health response paths and reports readiness failures safely', async () => {
  for (const path of ['/health/live', '/health/ready']) {
    const response = await request(createApp(() => Promise.resolve(true))).get(
      path
    );
    expect(response.status).toBe(200);
    healthResponseSchema.parse(response.body);
  }
  const response = await request(createApp()).get('/health/ready');
  expect(response.status).toBe(503);
  expect(apiErrorSchema.parse(response.body).code).toBe('SERVICE_UNAVAILABLE');
});
it('reuses a valid UUID and replaces malformed, oversized, and duplicate IDs', async () => {
  const id = randomUUID();
  const app = createApp();
  expect(
    (await request(app).get('/').set('X-Request-ID', id)).headers[
      'x-request-id'
    ]
  ).toBe(id);
  for (const value of ['bad', 'a'.repeat(200), [id, randomUUID()]]) {
    const response = await request(app).get('/').set({ 'X-Request-ID': value });
    expect(response.headers['x-request-id']).not.toBe(value);
    expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  }
});
it('keeps concurrent IDs through async work and database logging', async () => {
  const ids = [randomUUID(), randomUUID()];
  const seen: string[] = [];
  const app = createApp(async () => {
    const before = requestContext.getStore()?.requestId;
    await delay(10);
    expect(requestContext.getStore()?.requestId).toBe(before);
    if (before) seen.push(before);
    createDatabaseLogger('cell').info?.('private-message', {
      password: 'private-secret',
    });
    return true;
  });
  await Promise.all(
    ids.map(id => request(app).get('/health/ready').set('X-Request-ID', id))
  );
  expect(seen.sort()).toEqual(ids.sort());
  expect(requestContext.getStore()).toBeUndefined();
  expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain(
    'private'
  );
});
it('maps malformed, oversized, compressed and unsupported bodies without leaking input', async () => {
  const app = createApp();
  const malformed = await request(app)
    .post('/')
    .type('json')
    .send('{"secret":private');
  expect(malformed.status).toBe(400);
  expect(apiErrorSchema.parse(malformed.body).code).toBe('INVALID_INPUT');
  const oversized = await request(app)
    .post('/')
    .send({ secret: 'x'.repeat(102400) });
  expect(oversized.status).toBe(413);
  expect(apiErrorSchema.parse(oversized.body).code).toBe('PAYLOAD_TOO_LARGE');
  const compressed = await request(app)
    .post('/')
    .type('json')
    .set('Content-Encoding', 'gzip')
    .send(gzipSync('{"secret":"private"}'));
  expect(compressed.status).toBe(415);
  const unsupported = await request(app).post('/').type('text').send('private');
  expect(unsupported.status).toBe(415);
  const charset = await request(app)
    .post('/')
    .set('Content-Type', 'application/json; charset=iso-8859-1')
    .send('{}');
  expect(charset.status).toBe(415);
  for (const response of [
    malformed,
    oversized,
    compressed,
    unsupported,
    charset,
  ]) {
    apiErrorSchema.parse(response.body);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.text).not.toContain('private');
  }
});
it('logs an unexpected failure once and never serializes raw fault, headers, or body', async () => {
  const app = createApp(() => {
    createDatabaseLogger('cell').error?.(new Error('private-db'), {
      token: 'private-token',
    });
    throw new Error('private-sql-password');
  });
  const response = await request(app)
    .get('/health/ready?secret=private')
    .set('Authorization', 'Bearer private')
    .set('Cookie', 'private');
  expect(response.status).toBe(500);
  expect(apiErrorSchema.parse(response.body).code).toBe('INTERNAL_ERROR');
  expect(logger.error).toHaveBeenCalledTimes(1);
  expect(
    JSON.stringify([
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.error).mock.calls,
    ])
  ).not.toContain('private');
  expect(response.text).not.toContain('private');
});
