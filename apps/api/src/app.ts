/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import { healthResponseSchema } from '@nap/shared';
import { correlation } from './middleware/correlation.js';
import { requestLogging } from './middleware/requestLogging.js';
import { jsonBody } from './middleware/jsonBody.js';
import { errorHandler } from './middleware/errorHandler.js';
import { HttpError } from './util/httpError.js';

/** Construct HTTP boundaries without connecting databases or opening a listener. */
export function createApp(
  isReady: () => Promise<boolean> = () => Promise.resolve(false)
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlation, requestLogging, jsonBody);
  app.use(['/health/live', '/health/ready'], (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/health/live', (_request, response) => {
    response.json(
      healthResponseSchema.parse({ version: 1, data: { status: 'ok' } })
    );
  });
  app.get('/health/ready', async (_request, response) => {
    if (!(await isReady())) throw new HttpError('SERVICE_UNAVAILABLE');
    response.json(
      healthResponseSchema.parse({ version: 1, data: { status: 'ok' } })
    );
  });
  app.use((_request, _response, next) => next(new HttpError('NOT_FOUND')));
  app.use(errorHandler);
  return app;
}
