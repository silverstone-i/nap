/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { HttpError } from '../util/httpError.js';
import type { z } from 'zod';
import type { ApiError } from '@nap/shared';
import type { RequestHandler } from 'express';

/**
 * Does: Turns the problems a schema found into a map from field path to the
 * messages for that path.
 * Called by: validateBody, when a request body fails its schema.
 * Why: paths are joined with "." and a problem with the body as a whole uses
 * the key "", so a client can match each message to a form field. Messages
 * are Zod's own: they describe the schema and the received type and never
 * echo the received value or anything from the server.
 */
function toFieldErrors(issues: readonly z.core.$ZodIssue[]) {
  const fieldErrors: NonNullable<ApiError['fieldErrors']> = {};
  for (const issue of issues) {
    const path = issue.path.map(segment => String(segment)).join('.');
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Does: Checks a request's JSON body against the given schema, replaces
 * request.body with the checked value, or passes an INVALID_INPUT error
 * carrying per-field messages to the next handler.
 * Called by: route definitions, after jsonBody and before the handler.
 * Why: ARCH-043 requires the API to validate requests at its transport
 * boundary, so the handler behind this middleware only sees a body the schema
 * accepted. A request with no body fails as a whole under the key "".
 */
export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      next(new HttpError('INVALID_INPUT', toFieldErrors(result.error.issues)));
      return;
    }
    request.body = result.data;
    next();
  };
}
