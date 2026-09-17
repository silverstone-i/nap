/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

export const transportVersion = 1;

export const healthResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: z.strictObject({ status: z.literal('ok') }),
});

export const notFoundResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  error: z.strictObject({
    code: z.literal('NOT_FOUND'),
    message: z.literal('Not found'),
  }),
});

export const healthResponse = Object.freeze({
  version: transportVersion,
  data: Object.freeze({ status: 'ok' }),
});

export const notFoundResponse = Object.freeze({
  version: transportVersion,
  error: Object.freeze({ code: 'NOT_FOUND', message: 'Not found' }),
});
