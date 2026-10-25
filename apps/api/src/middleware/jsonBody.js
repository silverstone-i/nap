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
 * it somehow passed the origin check. A router registered for uploads takes
 * `multipart/form-data` instead, and only that (docs/architecture/bff.md).
 * @param {{uploadPaths?: string[]}} [options] Mount paths, such as
 *   `/api/tenant-settings/v1/logo`, of routers that take uploads.
 * @returns {import('express').RequestHandler}
 */
export function jsonBodyOnly({ uploadPaths = [] } = {}) {
  const uploads = new Set(uploadPaths);
  return (request, response, next) => {
    const declared = Number(request.headers['content-length'] ?? '0');
    const streamed = request.headers['transfer-encoding'] !== undefined;
    if (!streamed && !(Number.isFinite(declared) && declared > 0))
      return next();
    const path = request.originalUrl.split('?')[0].replace(/\/+$/, '');
    const expected = uploads.has(path)
      ? 'multipart/form-data'
      : 'application/json';
    if (!request.is(expected))
      return sendError(response, 'UNSUPPORTED_MEDIA_TYPE');
    next();
  };
}
