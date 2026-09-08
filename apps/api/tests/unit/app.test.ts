/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiErrorSchema, healthResponseSchema } from '@nap/shared';
import { createApp } from '../../src/app.js';
import { correlation } from '../../src/middleware/correlation.js';
import { requestLogging } from '../../src/middleware/requestLogging.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
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
it('logs one completion record per request with its ID and a fixed route name, never the path', async () => {
  const id = randomUUID();
  const app = createApp(() => Promise.resolve(true));
  await request(app).get('/health/live').set('X-Request-ID', id);
  await request(app).get('/nested/private?secret=private');
  const records = vi
    .mocked(logger.info)
    .mock.calls.map(call => call[0] as Record<string, unknown>)
    .filter(record => record.event === 'http.completed');
  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({
    requestId: id,
    route: 'health.live',
    status: 200,
    outcome: 'finished',
  });
  expect(records[0]?.durationMs).toEqual(expect.any(Number));
  expect(records[1]).toMatchObject({ route: 'unmatched', status: 404 });
  expect(records[1]?.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(JSON.stringify(records)).not.toMatch(/private|nested|health\/live/);
});
it('destroys a response committed before an unmapped fault instead of writing error text', async () => {
  const app = express();
  app.use(correlation, requestLogging);
  app.get('/', (_request, response) => {
    response.write('partial');
    throw new Error('private');
  });
  app.use(errorHandler);
  await expect(request(app).get('/')).rejects.toThrow();
  expect(logger.error).toHaveBeenCalledTimes(1);
  const records = [
    ...vi.mocked(logger.info).mock.calls,
    ...vi.mocked(logger.error).mock.calls,
  ];
  expect(JSON.stringify(records)).not.toContain('private');
  expect(records.map(call => call[0])).toContainEqual(
    expect.objectContaining({ event: 'http.completed', outcome: 'aborted' })
  );
});
it('trusts no proxy hop unless told how many', () => {
  expect(createApp().get('trust proxy')).toBe(0);
  expect(
    createApp(undefined, undefined, { trustProxyHops: 2 }).get('trust proxy')
  ).toBe(2);
});
