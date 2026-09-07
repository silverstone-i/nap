/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { z } from 'zod';
import type { Response } from 'express';

/**
 * Does: Checks an outgoing response body against its schema, then writes it as
 * JSON with the given status.
 * Called by: route handlers whenever they send a success body.
 * Why: ARCH-043 requires response validation at the transport boundary. A body
 * that fails its schema is thrown as a plain Error so the error handler
 * answers with the generic INTERNAL_ERROR envelope and the defective body
 * never reaches the client.
 * @throws If value does not satisfy schema.
 */
export function sendContract<T extends z.ZodType>(
  response: Response,
  schema: T,
  value: z.input<T>,
  status = 200
) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error('Response body violates its transport contract');
  }
  response.status(status).json(result.data);
}
