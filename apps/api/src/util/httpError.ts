/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ApiError, ApiErrorCode } from '@nap/shared';

/** Trusted application refusal; messages come from the boundary's fixed map. */
export class HttpError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly fieldErrors?: ApiError['fieldErrors']
  ) {
    super(code);
  }
}

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
