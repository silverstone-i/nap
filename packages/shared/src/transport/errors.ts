/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { transportVersion } from './envelopes.js';

/**
 * Does: Lists every stable machine-readable code an API error response may
 * carry.
 * Used by: apiErrorSchema, the API's status and message table, and web code
 * that branches on a failure.
 * Why: ARCH-043 makes this package the owner of the code registry; a code is
 * added here before the API can answer with it.
 */
export const apiErrorCodes = [
  'INVALID_INPUT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

/**
 * Does: Represents one code from the error-code registry.
 * Used by: API code that raises a refusal and web code that inspects one.
 */
export type ApiErrorCode = (typeof apiErrorCodes)[number];

/**
 * Does: Describes the body of every API error response: the version, a code
 * from the registry, a safe message, and per-field messages for input
 * validation only.
 * Used by: the API error handler when writing a failure, and the web client
 * when checking one.
 * Why: the object is strict so diagnostic fields never reach a client, and
 * fieldErrors is refused with any code but INVALID_INPUT (ARCH-043).
 */
export const apiErrorSchema = z
  .strictObject({
    version: z.literal(transportVersion),
    code: z.enum(apiErrorCodes),
    message: z.string().min(1),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .refine(
    value => value.fieldErrors === undefined || value.code === 'INVALID_INPUT',
    {
      message: 'Field errors belong only to input validation',
      path: ['fieldErrors'],
    }
  );

/**
 * Does: Represents an API error response body.
 * Used by: API code that builds a failure and web code that presents one.
 */
export type ApiError = z.infer<typeof apiErrorSchema>;
