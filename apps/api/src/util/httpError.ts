/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ApiError, ApiErrorCode } from '@nap/shared';

/**
 * Does: Represents an error the API deliberately returns to a client,
 * identified by a code from the shared error-code list and, for
 * INVALID_INPUT, optional per-field details.
 * Used by: handlers and middleware to signal a refusal, and the error handler
 * to choose the status and message.
 * Why: the client-facing message is never taken from this error; it comes
 * from errorResponses, so no free-form text reaches the client.
 */
export class HttpError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly fieldErrors?: ApiError['fieldErrors']
  ) {
    super(code);
  }
}

/**
 * Does: Maps each API error code to the HTTP status and fixed message sent
 * to the client.
 * Used by: the error handler when writing an error response.
 * Why: this table is the only source of client-facing error text.
 */
export const errorResponses = {
  INVALID_INPUT: { status: 400, message: 'Invalid request' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request body too large' },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: 'Unsupported request media type',
  },
  NOT_FOUND: { status: 404, message: 'Not found' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'Service unavailable' },
  INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
} satisfies Record<ApiErrorCode, { status: number; message: string }>;
