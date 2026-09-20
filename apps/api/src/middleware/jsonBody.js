/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { sendError } from '../framework/envelope.js';

/**
 * Require JSON for any request that carries a body.
 *
 * A bodyless request passes, which is what lets `POST /auth/logout` and a
 * rotation carry no payload at all. A request that does carry a body must
 * declare `application/json`; another type is refused before the body is
 * read, so a form post from another site cannot reach an operation even if
 * it somehow passed the origin check.
 * @returns {import('express').RequestHandler}
 */
export function jsonBodyOnly() {
  return (request, response, next) => {
    const declared = Number(request.headers['content-length'] ?? '0');
    const streamed = request.headers['transfer-encoding'] !== undefined;
    if (!streamed && !(Number.isFinite(declared) && declared > 0))
      return next();
    if (!request.is('application/json'))
      return sendError(response, 'UNSUPPORTED_MEDIA_TYPE');
    next();
  };
}
