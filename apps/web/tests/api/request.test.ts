/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, expect, it, vi } from 'vitest';
import { healthResponseSchema } from '@nap/shared';
import { requestContract } from '../../src/api/request.js';

const requestId = '0b1a9d3e-6c1f-4b7a-9d3e-6c1f4b7a9d3e';

/**
 * Does: Replaces fetch with one that answers the given body and status.
 * Called by: each test that needs a reply from the server.
 */
function reply(body: string, status: number) {
  const fetch = vi.fn().mockResolvedValue(
    new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
    })
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

it('returns a checked success body with the request identifier', async () => {
  const fetch = reply(
    JSON.stringify({ version: 1, data: { status: 'ok' } }),
    200
  );
  const result = await requestContract('/health/live', healthResponseSchema);
  expect(result).toEqual({
    ok: true,
    body: { version: 1, data: { status: 'ok' } },
    requestId,
  });
  const [path, init] = fetch.mock.calls[0] as [string, RequestInit];
  expect(path).toBe('/health/live');
  expect(init.credentials).toBe('same-origin');
  expect(new Headers(init.headers).get('Accept')).toBe('application/json');
});
it('returns the server error envelope, field errors included', async () => {
  reply(
    JSON.stringify({
      version: 1,
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      fieldErrors: { name: ['Too small'] },
    }),
    400
  );
  const result = await requestContract('/x', healthResponseSchema);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.status).toBe(400);
  expect(result.requestId).toBe(requestId);
  expect(result.error).toEqual({
    version: 1,
    code: 'INVALID_INPUT',
    message: 'Invalid request',
    fieldErrors: { name: ['Too small'] },
  });
});
it('discards a reply that is not a valid envelope and keeps the identifier', async () => {
  for (const [body, status] of [
    [
      JSON.stringify({ version: 1, data: { status: 'ok', host: 'private' } }),
      200,
    ],
    ['<html>private stack</html>', 500],
    [JSON.stringify({ error: 'private stack' }), 500],
    [
      JSON.stringify({
        version: 1,
        code: 'NOT_FOUND',
        message: 'x',
        stack: 'private',
      }),
      404,
    ],
  ] as const) {
    reply(body, status);
    const result = await requestContract('/x', healthResponseSchema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UNREADABLE_RESPONSE');
    expect(result.error.message).not.toContain('private');
    expect(result.status).toBe(status);
    expect(result.requestId).toBe(requestId);
  }
});
it('reports an unreachable server as a network failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('private')));
  const result = await requestContract('/x', healthResponseSchema);
  expect(result).toEqual({
    ok: false,
    error: {
      code: 'NETWORK_FAILURE',
      message: 'The server could not be reached',
    },
    status: undefined,
    requestId: undefined,
  });
});
