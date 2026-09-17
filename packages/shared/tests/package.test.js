/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import {
  healthResponse,
  healthResponseSchema,
  notFoundResponse,
  notFoundResponseSchema,
  transportVersion,
} from '@nap/shared';

it('exports validated transport responses from the package boundary', () => {
  expect(transportVersion).toBe(1);
  expect(healthResponseSchema.parse(healthResponse)).toEqual(healthResponse);
  expect(notFoundResponseSchema.parse(notFoundResponse)).toEqual(
    notFoundResponse
  );
});
