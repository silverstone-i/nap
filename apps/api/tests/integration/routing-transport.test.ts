/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeEach, afterEach, afterAll, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import request from 'supertest';
import { routeToCell } from '../../src/middleware/routeToCell.js';
import { jsonBody } from '../../src/middleware/jsonBody.js';
import { correlation } from '../../src/middleware/correlation.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createAdminDatabase } from '../../src/db/admin/index.js';
import { adminRepositories } from '../../src/db/admin/repositories.js';
import type { IncomingHttpHeaders } from 'node:http';

vi.mock('../../src/services/cellRouting.js', () => ({
  assignedDestination: vi.fn(() => Promise.resolve('cell-1')),
}));
const db = createAdminDatabase('postgres://unused:unused@localhost/unused', {
  repositories: adminRepositories,
});
let server: ReturnType<typeof createServer>;
let origin: string;
let requests: IncomingHttpHeaders[];
let mode: 'ok' | 'redirect' | 'timeout';

beforeEach(async () => {
  requests = [];
  mode = 'ok';
  server = createServer((req, res) => {
    requests.push(req.headers);
    req.resume();
    if (mode === 'timeout') return;
    if (mode === 'redirect') {
      res.writeHead(302, { location: 'https://private.internal' });
      res.end();
      return;
    }
    res.setHeader('x-internal-secret', 'private');
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
afterAll(async () => {
  await db.close();
});

/**
 * Does: Creates an HTTP application that forwards requests with a short deadline.
 * Called by: transport tests before sending requests to the test upstream server.
 */
function app(timeoutMs = 1000) {
  const value = express();
  value.use(
    correlation,
    jsonBody,
    routeToCell(db, { origins: new Map([['cell-1', origin]]), timeoutMs }),
    errorHandler
  );
  return value;
}

it('strips forged identity/forwarding headers and preserves only safe request and response fields', async () => {
  const id = '12345678-1234-4234-8234-123456789abc';
  const reply = await request(app())
    .post('/api/core/v1/example')
    .set('Cookie', 'nap_session=opaque')
    .set('X-Forwarded-For', '9.8.7.6')
    .set('X-Nap-Tenant', 'spoof')
    .set('X-Nap-Cell', 'cell-2')
    .set('X-Request-ID', id)
    .set('Authorization', 'Bearer spoof')
    .send({ value: 1 });
  expect(reply.status).toBe(200);
  expect(requests).toHaveLength(1);
  expect(requests[0].cookie).toBe('nap_session=opaque');
  expect(requests[0]['x-request-id']).toBe(id);
  expect(requests[0]['x-forwarded-for']).not.toBe('9.8.7.6');
  expect(requests[0]['x-nap-tenant']).toBeUndefined();
  expect(requests[0]['x-nap-cell']).toBeUndefined();
  expect(requests[0].authorization).toBeUndefined();
  expect(reply.headers['x-internal-secret']).toBeUndefined();
  expect(reply.headers['cache-control']).toBe('no-store');
});

it('refuses redirects without exposing destinations or retrying', async () => {
  mode = 'redirect';
  const reply = await request(app()).get('/api/core/v1/example');
  expect(reply.status).toBe(503);
  expect(reply.headers.location).toBeUndefined();
  expect(JSON.stringify(reply.body)).not.toContain('private');
  expect(requests).toHaveLength(1);
});

it('bounds hung mutations and refuses oversized bodies before forwarding', async () => {
  mode = 'timeout';
  expect(
    (await request(app(30)).post('/api/core/v1/example').send({ value: 1 }))
      .status
  ).toBe(503);
  expect(requests).toHaveLength(1);
  expect(
    (
      await request(app())
        .post('/api/core/v1/example')
        .send({ value: 'x'.repeat(103000) })
    ).status
  ).toBe(413);
  expect(requests).toHaveLength(1);
});
