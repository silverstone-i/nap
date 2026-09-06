/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

export const apiErrorCodes = [
  'INVALID_INPUT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'NOT_FOUND',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorSchema = z
  .strictObject({
    version: z.literal(1),
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
export type ApiError = z.infer<typeof apiErrorSchema>;
