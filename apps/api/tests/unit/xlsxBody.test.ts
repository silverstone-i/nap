/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import request from 'supertest';
import { expect, it } from 'vitest';
import {
  apiErrorSchema,
  importUploadLimitBytes,
  xlsxMediaType,
} from '@nap/shared';
import { jsonBody } from '../../src/middleware/jsonBody.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { xlsxBody } from '../../src/middleware/xlsxBody.js';

const app = express();
app.use(jsonBody);
app.post('/import', xlsxBody, (request, response) => {
  const body: unknown = request.body;
  response.json({ length: Buffer.isBuffer(body) ? body.length : null });
});
app.post('/json', (request, response) => {
  const body: unknown = request.body;
  response.json({ body: body === undefined ? 'absent' : 'present' });
});
app.use(errorHandler);

it('delivers workbook bytes to the handler and leaves them unread elsewhere', async () => {
  const bytes = Buffer.from('PK not really a workbook');
  const delivered = await request(app)
    .post('/import')
    .set('Content-Type', xlsxMediaType)
    .send(bytes);
  expect(delivered.status).toBe(200);
  expect(delivered.body).toEqual({ length: bytes.length });
  const elsewhere = await request(app)
    .post('/json')
    .set('Content-Type', xlsxMediaType)
    .send(bytes);
  expect(elsewhere.status).toBe(200);
  expect(elsewhere.body).toEqual({ body: 'absent' });
});

it.each([
  [
    'a declared length over the ceiling',
    {
      'Content-Type': xlsxMediaType,
      'Content-Length': String(importUploadLimitBytes + 1),
    },
    413,
    'PAYLOAD_TOO_LARGE',
  ],
  [
    'a compressed body',
    { 'Content-Type': xlsxMediaType, 'Content-Encoding': 'gzip' },
    415,
    'UNSUPPORTED_MEDIA_TYPE',
  ],
  [
    'another media type',
    { 'Content-Type': 'application/octet-stream' },
    415,
    'UNSUPPORTED_MEDIA_TYPE',
  ],
  ['an empty body', { 'Content-Type': xlsxMediaType }, 400, 'INVALID_INPUT'],
])('refuses %s', async (_case, headers, status, code) => {
  const response = await request(app).post('/import').set(headers).send('');
  expect(response.status).toBe(status);
  expect(apiErrorSchema.parse(response.body).code).toBe(code);
});
