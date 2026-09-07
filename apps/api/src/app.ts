/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import { healthResponseSchema, transportVersion } from '@nap/shared';
import { correlation } from './middleware/correlation.js';
import { requestLogging } from './middleware/requestLogging.js';
import { jsonBody } from './middleware/jsonBody.js';
import { errorHandler } from './middleware/errorHandler.js';
import { HttpError } from './util/httpError.js';
import { sendContract } from './util/sendContract.js';

/**
 * Does: Builds the Express application: the shared middleware chain, the two
 * health endpoints, the not-found fallback, and the error handler.
 * Called by: createRuntime at startup, and by app tests directly.
 * Why: it opens no listener and connects to no database, so tests can drive
 * it with in-memory requests. The isReady callback decides what the readiness
 * endpoint answers and defaults to "not ready", so a bare app never reports
 * itself ready to serve.
 */
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
    sendContract(response, healthResponseSchema, {
      version: transportVersion,
      data: { status: 'ok' },
    });
  });
  app.get('/health/ready', async (_request, response) => {
    if (!(await isReady())) throw new HttpError('SERVICE_UNAVAILABLE');
    sendContract(response, healthResponseSchema, {
      version: transportVersion,
      data: { status: 'ok' },
    });
  });
  app.use((_request, _response, next) => next(new HttpError('NOT_FOUND')));
  app.use(errorHandler);
  return app;
}
