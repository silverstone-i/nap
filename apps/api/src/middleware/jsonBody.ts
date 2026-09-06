/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import { HttpError } from '../util/httpError.js';
import type { RequestHandler } from 'express';

const parse = express.json({ limit: '100kb', inflate: false });

/** Classify parser errors here so arbitrary application error fields are untrusted. */
export const jsonBody: RequestHandler = (request, response, next) => {
  const encoding = request.headers['content-encoding'];
  if (encoding && encoding.toLowerCase() !== 'identity') {
    next(new HttpError('UNSUPPORTED_MEDIA_TYPE'));
    return;
  }
  const length = request.headers['content-length'];
  if (length && Number(length) > 100 * 1024) {
    next(new HttpError('PAYLOAD_TOO_LARGE'));
    return;
  }
  if (
    (Number(length) > 0 || request.headers['transfer-encoding']) &&
    !request.is('application/json')
  ) {
    next(new HttpError('UNSUPPORTED_MEDIA_TYPE'));
    return;
  }
  parse(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    const type =
      typeof error === 'object' && error !== null && 'type' in error
        ? error.type
        : undefined;
    const code =
      type === 'entity.too.large'
        ? 'PAYLOAD_TOO_LARGE'
        : type === 'encoding.unsupported' || type === 'charset.unsupported'
          ? 'UNSUPPORTED_MEDIA_TYPE'
          : type === 'entity.parse.failed' ||
              type === 'request.aborted' ||
              type === 'request.size.invalid'
            ? 'INVALID_INPUT'
            : 'INTERNAL_ERROR';
    next(new HttpError(code));
  });
};
