/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requestContext } from '../util/requestContext.js';
import type { RequestHandler } from 'express';

/** Open request scope before parsing, including malformed and unknown requests. */
export const correlation: RequestHandler = (request, response, next) => {
  const values = request.headersDistinct['x-request-id'];
  const supplied = values?.length === 1 ? values[0] : undefined;
  const parsed = z.uuid().safeParse(supplied);
  const requestId = parsed.success ? parsed.data : randomUUID();
  response.setHeader('X-Request-ID', requestId);
  requestContext.run({ requestId }, next);
};
