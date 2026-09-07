/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  apiErrorSchema,
  batchLimit,
  bulkInsertBodySchema,
  bulkUpdateBodySchema,
  idsBodySchema,
  updateBodySchema,
} from '@nap/shared';

const record = z.strictObject({ name: z.string() });
const change = z.strictObject({ id: z.string(), name: z.string() });

it('accepts bounded batches and refuses empty, oversized, or duplicate ones', () => {
  expect(batchLimit).toBe(500);
  expect(idsBodySchema.parse({ ids: ['a', 'b'] })).toEqual({ ids: ['a', 'b'] });
  const many = Array.from({ length: batchLimit + 1 }, (_, i) => String(i));
  for (const ids of [[], many, ['a', 'a'], ['']]) {
    expect(idsBodySchema.safeParse({ ids }).success).toBe(false);
  }
  expect(idsBodySchema.safeParse({ ids: ['a'], extra: 1 }).success).toBe(false);
});

it('builds the bulk-insert, update, and bulk-update bodies from a record', () => {
  expect(
    bulkInsertBodySchema(record).parse({ records: [{ name: 'x' }] })
  ).toEqual({ records: [{ name: 'x' }] });
  expect(bulkInsertBodySchema(record).safeParse({ records: [] }).success).toBe(
    false
  );
  expect(
    updateBodySchema(record).parse({ ids: ['a'], changes: { name: 'y' } })
  ).toEqual({ ids: ['a'], changes: { name: 'y' } });
  expect(
    updateBodySchema(record).safeParse({ ids: ['a', 'a'], changes: {} }).success
  ).toBe(false);
  expect(
    bulkUpdateBodySchema(change).parse({ records: [{ id: 'a', name: 'y' }] })
  ).toEqual({ records: [{ id: 'a', name: 'y' }] });
  expect(
    bulkUpdateBodySchema(change).safeParse({ records: [{ name: 'y' }] }).success
  ).toBe(false);
});

it('carries the authentication, permission, and conflict codes', () => {
  for (const code of ['UNAUTHENTICATED', 'FORBIDDEN', 'CONFLICT']) {
    expect(
      apiErrorSchema.parse({ version: 1, code, message: 'Safe message' }).code
    ).toBe(code);
  }
});
