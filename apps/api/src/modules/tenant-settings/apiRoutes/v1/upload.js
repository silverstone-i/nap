/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import busboy from 'busboy';
import { MAX_FILE_BYTES } from '@nap/shared';
import { sendError } from '../../../../framework/envelope.js';

/**
 * Read one uploaded file, the form field `file`, into `request.upload`
 * (M0006-02-R008). Reading stops at 2 MB plus one byte, so an oversized
 * upload is marked `truncated` without being held in memory; any other
 * field, a second file, or a body that is not `multipart/form-data` is
 * `INVALID_INPUT`. The browser's file name is ignored (R009).
 * @returns {import('express').RequestHandler}
 */
export function uploadedFile() {
  return (request, response, next) => {
    if (!request.is('multipart/form-data'))
      return sendError(response, 'INVALID_INPUT');
    let parser;
    try {
      parser = busboy({
        headers: request.headers,
        limits: { files: 1, fields: 0, fileSize: MAX_FILE_BYTES },
      });
    } catch {
      return sendError(response, 'INVALID_INPUT');
    }
    let upload;
    let invalid = false;
    const fail = () => {
      invalid = true;
    };
    parser.on('file', (name, stream, info) => {
      if (name !== 'file') {
        fail();
        stream.resume();
        return;
      }
      const chunks = [];
      upload = { buffer: null, declaredType: info.mimeType, truncated: false };
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('limit', () => {
        upload.truncated = true;
      });
      stream.on('end', () => {
        upload.buffer = Buffer.concat(chunks);
      });
    });
    parser.on('field', fail);
    parser.on('filesLimit', fail);
    parser.on('fieldsLimit', fail);
    parser.on('error', () => {
      request.unpipe(parser);
      request.resume();
      if (!response.headersSent) sendError(response, 'INVALID_INPUT');
    });
    parser.on('close', () => {
      if (response.headersSent) return;
      if (invalid || !upload?.buffer)
        return sendError(response, 'INVALID_INPUT');
      request.upload = upload;
      next();
    });
    request.pipe(parser);
  };
}
