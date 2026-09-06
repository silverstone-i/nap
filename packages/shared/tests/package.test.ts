/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import {
  apiErrorSchema,
  apiErrorCodes,
  healthResponseSchema,
} from '@nap/shared';

it('exports versioned runtime contracts through the public package', () => {
  for (const code of apiErrorCodes) {
    expect(
      apiErrorSchema.parse({ version: 1, code, message: 'Safe message' }).code
    ).toBe(code);
  }
  expect(
    healthResponseSchema.parse({ version: 1, data: { status: 'ok' } })
  ).toBeDefined();
});
it('rejects unsupported versions, diagnostic fields, and misplaced field errors', () => {
  const error = { version: 1, code: 'INTERNAL_ERROR', message: 'Safe message' };
  for (const extra of [
    { version: 2 },
    { stack: 'secret' },
    { fieldErrors: { name: ['Invalid'] } },
  ]) {
    expect(apiErrorSchema.safeParse({ ...error, ...extra }).success).toBe(
      false
    );
  }
  expect(
    apiErrorSchema.safeParse({
      ...error,
      code: 'INVALID_INPUT',
      fieldErrors: { name: ['Required'] },
    }).success
  ).toBe(true);
  expect(
    healthResponseSchema.safeParse({
      version: 1,
      data: { status: 'ok', host: 'secret' },
    }).success
  ).toBe(false);
});
