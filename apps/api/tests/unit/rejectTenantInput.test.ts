/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import request from 'supertest';
import { expect, it } from 'vitest';
import { apiErrorSchema } from '@nap/shared';
import { jsonBody } from '../../src/middleware/jsonBody.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { rejectTenantInput } from '../../src/middleware/rejectTenantInput.js';

const app = express();
app.use(jsonBody);
app.post('/records/:key', rejectTenantInput, (_request, response) => {
  response.json({ ok: true });
});
app.post('/by/:tenantId', rejectTenantInput, (_request, response) => {
  response.json({ ok: true });
});
app.use(errorHandler);

it.each([
  ['headers.x-tenant-id', { header: { 'X-Tenant-Id': 'a' } }],
  ['headers.tenant_id', { header: { tenant_id: 'a' } }],
  ['query.tenantId', { path: '/records/k?tenantId=a' }],
  ['query.tenant-id', { path: '/records/k?tenant-id=a' }],
  ['params.tenantId', { path: '/by/a' }],
  ['tenant_id', { body: { tenant_id: 'a', name: 'x' } }],
  [
    'records.1.TENANT_ID',
    { body: { records: [{ name: 'x' }, { TENANT_ID: 'a' }] } },
  ],
  [
    'changes.nested.tenantId',
    { body: { changes: { nested: { tenantId: 'a' } } } },
  ],
] as const)(
  'refuses a tenant value at %s without echoing it',
  async (path, input) => {
    const response = await request(app)
      .post('path' in input ? input.path : '/records/k')
      .set('header' in input ? input.header : {})
      .send('body' in input ? input.body : { name: 'x' });
    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(response.body);
    expect(body.code).toBe('INVALID_INPUT');
    expect(Object.keys(body.fieldErrors ?? {})).toEqual([path]);
    expect(JSON.stringify(body)).not.toContain('"a"');
  }
);

it('passes a request that names no tenant anywhere', async () => {
  const response = await request(app)
    .post('/records/k?name=x')
    .set('X-Other', 'a')
    .send({ records: [{ name: 'x', tenant: 'word' }] });
  expect(response.status).toBe(200);
});
