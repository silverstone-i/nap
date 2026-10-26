/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { sendControlError } from '../../src/modules/admin-tenancy/apiRoutes/v1/control.js';
import { AdminControlError } from '../../src/modules/admin-tenancy/domain/errors.js';

/** An app whose one route fails with `error`, as a control route does. */
function failingWith(error) {
  const app = express();
  app.post('/provision', (_request, response) =>
    sendControlError(response, error)
  );
  return app;
}

describe('control error responses (I0006-R023)', () => {
  it.each(['code', 'client', 'email'])(
    'sends a provisioning CONFLICT with details.field %s',
    async field => {
      const response = await request(
        failingWith(new AdminControlError('CONFLICT', { field }))
      ).post('/provision');
      expect(response.status).toBe(409);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.error).toMatchObject({
        code: 'CONFLICT',
        details: { field },
      });
    }
  );

  it('sends a CONFLICT without a field when the error names none', async () => {
    const response = await request(
      failingWith(new AdminControlError('CONFLICT'))
    ).post('/provision');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect(response.body.error.details).toBeUndefined();
  });

  it('sends an unknown code as INTERNAL_ERROR', async () => {
    const response = await request(
      failingWith({ code: 'SOMETHING_ELSE' })
    ).post('/provision');
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});
