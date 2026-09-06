/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { apiErrorSchema } from '@nap/shared';
import { HttpError, errorResponses } from '../util/httpError.js';
import { logger } from '../util/logger.js';
import type { ErrorRequestHandler } from 'express';

/** Map trusted refusals at the final boundary, keeping arbitrary faults private. */
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
      version: 1,
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
