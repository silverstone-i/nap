/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

export const healthResponseSchema = z.strictObject({
  version: z.literal(1),
  data: z.strictObject({ status: z.literal('ok') }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
