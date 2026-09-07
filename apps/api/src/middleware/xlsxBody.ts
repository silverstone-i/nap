/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import { importUploadLimitBytes, xlsxMediaType } from '@nap/shared';
import { HttpError } from '../util/httpError.js';
import { fieldError } from '../util/fieldErrors.js';
import type { RequestHandler } from 'express';

const parse = express.raw({
  type: xlsxMediaType,
  limit: importUploadLimitBytes,
  inflate: false,
});

/**
 * Does: Reads a workbook sent as the request body into a Buffer stored on
 * request.body, or passes a fixed error to the next handler.
 * Called by: the framework router, on the import route only, after the gates
 * and before the import handler.
 * Why: the framework HTTP contract requires the upload ceiling to refuse
 * before the body is read, so Content-Length is checked first and the parser
 * is given the same limit for bodies sent without one. Compressed bodies and
 * any media type but the workbook type are refused, an empty body is invalid
 * input, and parser failures map to fixed codes so library text never reaches
 * the client. The JSON body parser leaves a workbook body unread for this.
 */
export const xlsxBody: RequestHandler = (request, response, next) => {
  const encoding = request.headers['content-encoding'];
  if (encoding && encoding.toLowerCase() !== 'identity') {
    next(new HttpError('UNSUPPORTED_MEDIA_TYPE'));
    return;
  }
  const length = request.headers['content-length'];
  if (length && Number(length) > importUploadLimitBytes) {
    next(new HttpError('PAYLOAD_TOO_LARGE'));
    return;
  }
  if (!request.is(xlsxMediaType)) {
    next(new HttpError('UNSUPPORTED_MEDIA_TYPE'));
    return;
  }
  parse(request, response, (error: unknown) => {
    if (error) {
      const type =
        typeof error === 'object' && error !== null && 'type' in error
          ? error.type
          : undefined;
      next(
        new HttpError(
          type === 'entity.too.large'
            ? 'PAYLOAD_TOO_LARGE'
            : type === 'encoding.unsupported'
              ? 'UNSUPPORTED_MEDIA_TYPE'
              : type === 'request.aborted' || type === 'request.size.invalid'
                ? 'INVALID_INPUT'
                : 'INTERNAL_ERROR'
        )
      );
      return;
    }
    const body: unknown = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      next(
        new HttpError('INVALID_INPUT', fieldError('', 'Workbook body required'))
      );
      return;
    }
    next();
  });
};
