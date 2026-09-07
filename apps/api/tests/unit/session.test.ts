/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { apiErrorSchema } from '@nap/shared';
import { correlation } from '../../src/middleware/correlation.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import {
  requireEntitlement,
  requirePermission,
  requireSession,
  requireTenant,
} from '../../src/middleware/session.js';
import { fullSession, withSession } from '../fixtures/testSession.js';
import type { ResolvedSession } from '../../src/middleware/session.js';

/** Does: Builds an app whose one route sits behind the four gates. */
function gated(session?: ResolvedSession) {
  const app = express();
  app.use(correlation, withSession(session));
  app.get(
    '/',
    requireSession,
    requireTenant,
    requireEntitlement('fixture'),
    requirePermission('fixture::records::list'),
    (_request, response) => {
      response.json({ ok: true });
    }
  );
  app.use(errorHandler);
  return app;
}

it('refuses without a session, then without a tenant, entitlement, or permission', async () => {
  const tenant = randomUUID();
  const actor = randomUUID();
  const cases: [ResolvedSession | undefined, number, string][] = [
    [undefined, 401, 'UNAUTHENTICATED'],
    [fullSession(undefined, actor), 403, 'FORBIDDEN'],
    [fullSession('not-a-uuid', actor), 403, 'FORBIDDEN'],
    [
      { ...fullSession(tenant, actor), entitlements: new Set(['other']) },
      403,
      'FORBIDDEN',
    ],
    [
      { ...fullSession(tenant, actor), permissions: new Set() },
      403,
      'FORBIDDEN',
    ],
  ];
  for (const [session, status, code] of cases) {
    const response = await request(gated(session)).get('/');
    expect(response.status).toBe(status);
    const body = apiErrorSchema.parse(response.body);
    expect(body.code).toBe(code);
    expect(body.fieldErrors).toBeUndefined();
  }
});

it('lets a fully resolved session through', async () => {
  const response = await request(
    gated(fullSession(randomUUID(), randomUUID()))
  ).get('/');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ok: true });
});
