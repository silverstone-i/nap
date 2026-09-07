/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { apiErrorSchema } from '@nap/shared';
import type { ApiError } from '@nap/shared';
import type { z } from 'zod';

/**
 * Does: Represents a failure the browser detected itself: the server could not
 * be reached, or its reply was not a valid response envelope.
 * Used by: requestContract, and screens that show a failure.
 * Why: the two codes sit outside the shared registry so a screen never
 * mistakes a client-side failure for a server refusal.
 */
export type ClientFailure = {
  code: 'NETWORK_FAILURE' | 'UNREADABLE_RESPONSE';
  message: string;
};

/**
 * Does: Represents the outcome of one API call: the checked response body on
 * success, or the server's error envelope or a client-side failure.
 * Used by: every caller of requestContract.
 * Why: both failure shapes carry code and message, so a screen shows
 * error.message and the request identifier without asking which kind it got.
 */
export type ApiResult<T> =
  | { ok: true; body: T; requestId: string | undefined }
  | {
      ok: false;
      error: ApiError | ClientFailure;
      status: number | undefined;
      requestId: string | undefined;
    };

/**
 * Does: Holds the fixed message shown for each client-detected failure.
 * Used by: requestContract when it builds a ClientFailure.
 * Why: the operational standards require a defined fallback in place of any
 * text the server did not send through the envelope.
 */
const fallbackMessages = {
  NETWORK_FAILURE: 'The server could not be reached',
  UNREADABLE_RESPONSE: 'The server returned an unexpected response',
} as const;

/**
 * Does: Builds the failed result for a reply that could not be read as an
 * envelope.
 * Called by: requestContract, when a body is not JSON or fails its schema.
 */
function unreadable(
  status: number | undefined,
  requestId: string | undefined
): ApiResult<never> {
  return {
    ok: false,
    error: {
      code: 'UNREADABLE_RESPONSE',
      message: fallbackMessages.UNREADABLE_RESPONSE,
    },
    status,
    requestId,
  };
}

/**
 * Does: Sends one same-origin HTTP request, checks the JSON reply against the
 * given success schema or the shared error schema, and returns the outcome
 * together with the X-Request-ID header the server echoed.
 * Called by: web code under api/, auth/, shell/, and pages/ whenever it talks
 * to the API.
 * Why: the operational standards require the client to validate the envelope,
 * present the safe message or a defined fallback, and keep the correlation
 * identifier for support. A reply that fails its schema is discarded and
 * reported as UNREADABLE_RESPONSE so unvalidated data never reaches a screen.
 */
export async function requestContract<T extends z.ZodType>(
  path: string,
  schema: T,
  init: RequestInit = {}
): Promise<ApiResult<z.output<T>>> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers,
    });
  } catch {
    return {
      ok: false,
      error: {
        code: 'NETWORK_FAILURE',
        message: fallbackMessages.NETWORK_FAILURE,
      },
      status: undefined,
      requestId: undefined,
    };
  }
  const requestId = response.headers.get('X-Request-ID') ?? undefined;
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return unreadable(response.status, requestId);
  }
  if (response.ok) {
    const parsed = schema.safeParse(json);
    return parsed.success
      ? { ok: true, body: parsed.data, requestId }
      : unreadable(response.status, requestId);
  }
  const parsed = apiErrorSchema.safeParse(json);
  return parsed.success
    ? { ok: false, error: parsed.data, status: response.status, requestId }
    : unreadable(response.status, requestId);
}
