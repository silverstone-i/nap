/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Transport contracts shared by the API and the web client. The API
 * sends these envelopes; the client validates responses against the schemas.
 */
import { z } from 'zod';

/** Version number carried by every API response envelope. */
export const transportVersion = 1;

/** Zod schema for the success envelope returned by the health routes. */
export const healthResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: z.strictObject({ status: z.literal('ok') }),
});

/** Zod schema for the error envelope returned for unknown routes. */
export const notFoundResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  error: z.strictObject({
    code: z.literal('NOT_FOUND'),
    message: z.literal('Not found'),
  }),
});

/** Frozen health-route success envelope; validates against `healthResponseSchema`. */
export const healthResponse = Object.freeze({
  version: transportVersion,
  data: Object.freeze({ status: 'ok' }),
});

/** Frozen unknown-route error envelope; validates against `notFoundResponseSchema`. */
export const notFoundResponse = Object.freeze({
  version: transportVersion,
  error: Object.freeze({ code: 'NOT_FOUND', message: 'Not found' }),
});
