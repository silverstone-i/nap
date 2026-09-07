/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { apiErrorSchema, transportVersion } from '@nap/shared';
import { HttpError, errorResponses } from '../util/httpError.js';
import { logger } from '../util/logger.js';
import type { ErrorRequestHandler } from 'express';

/**
 * Does: Turns an error thrown or passed on by any handler into the JSON error
 * response the client receives.
 * Called by: the app, last in the middleware chain, whenever a handler fails.
 * Why: only an HttpError chooses its status and message, from the fixed
 * table in errorResponses. Anything else becomes a generic 500 so unexpected
 * error text never reaches the client. Server-side failures are logged by
 * code only. If headers were already sent, the connection is destroyed
 * because a JSON body can no longer replace a partly written response. It
 * builds the envelope itself rather than through sendContract: a throw here
 * would reach Express's final handler, which writes HTML with the error text.
 */
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next
) => {
  const code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
  const mapped = errorResponses[code];
  if (mapped.status >= 500) logger.error({ event: 'http.failed', code });
  // A streaming response cannot be replaced with JSON after its headers commit.
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.status(mapped.status).json(
    apiErrorSchema.parse({
      version: transportVersion,
      code,
      message: mapped.message,
      ...(error instanceof HttpError &&
      code === 'INVALID_INPUT' &&
      error.fieldErrors
        ? { fieldErrors: error.fieldErrors }
        : {}),
    })
  );
};
