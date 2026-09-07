/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requestContext } from '../util/requestContext.js';
import type { RequestHandler } from 'express';

/**
 * Does: Gives every request an ID, echoes it in the X-Request-ID response
 * header, and makes it available to all code handling that request.
 * Called by: the app, first in the middleware chain, on every request.
 * Why: it runs before body parsing so malformed and unknown requests are
 * still correlated. A client-supplied X-Request-ID is used only when it is
 * exactly one header holding a valid UUID; anything else gets a fresh UUID,
 * so clients cannot put arbitrary text into logs.
 */
export const correlation: RequestHandler = (request, response, next) => {
  const values = request.headersDistinct['x-request-id'];
  const supplied = values?.length === 1 ? values[0] : undefined;
  const parsed = z.uuid().safeParse(supplied);
  const requestId = parsed.success ? parsed.data : randomUUID();
  response.setHeader('X-Request-ID', requestId);
  requestContext.run({ requestId }, next);
};
