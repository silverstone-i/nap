/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { successResponseSchema } from './envelopes.js';

/**
 * Does: Describes the body of a successful liveness or readiness response.
 * Used by: the API health routes when writing a response, and the web client
 * when checking one.
 * Why: the data object is strict so a probe answer never carries host or
 * dependency detail (ARCH-045).
 */
export const healthResponseSchema = successResponseSchema(
  z.strictObject({ status: z.literal('ok') })
);

/**
 * Does: Represents a successful health response body.
 * Used by: API and web code handling health responses.
 */
export type HealthResponse = z.infer<typeof healthResponseSchema>;
