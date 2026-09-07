/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  healthResponseSchema,
  listResponseSchema,
  pageSchema,
  successResponseSchema,
  transportVersion,
} from '@nap/shared';
import type { ListResponse, Page, SuccessResponse } from '@nap/shared';

const item = z.strictObject({ id: z.string() });
const success = { version: 1, data: { id: 'a' } };
const list = {
  version: 1,
  data: [{ id: 'a' }, { id: 'b' }],
  page: { size: 2, total: 5, cursor: 'b' },
};

it('accepts valid success and list bodies built from a record schema', () => {
  expect(transportVersion).toBe(1);
  expect(successResponseSchema(item).parse(success)).toEqual(success);
  expect(listResponseSchema(item).parse(list)).toEqual(list);
  expect(
    listResponseSchema(item).safeParse({
      version: 1,
      data: [],
      page: { size: 25, total: 0 },
    }).success
  ).toBe(true);
  expect(
    healthResponseSchema.safeParse({ version: 1, data: { status: 'ok' } })
      .success
  ).toBe(true);
});
it('rejects a wrong version, extra fields at every level, and a bad value', () => {
  for (const extra of [
    { version: 2 },
    { secret: 'x' },
    { data: { id: 'a', secret: 'x' } },
    { data: 'a' },
  ]) {
    expect(
      successResponseSchema(item).safeParse({ ...success, ...extra }).success
    ).toBe(false);
  }
  for (const page of [
    { size: 2, total: -1 },
    { size: 2, total: 1.5 },
    { size: 0, total: 5 },
    { size: '2', total: 5 },
    { size: 2, total: 5, cursor: '' },
    { size: 2, total: 5, cursor: null },
    { size: 2, total: 5, secret: 'x' },
  ]) {
    expect(pageSchema.safeParse(page).success).toBe(false);
    expect(listResponseSchema(item).safeParse({ ...list, page }).success).toBe(
      false
    );
  }
  for (const extra of [
    { version: 2 },
    { secret: 'x' },
    { page: undefined },
    { data: [{ id: 'a', secret: 'x' }] },
    { data: { id: 'a' } },
  ]) {
    expect(
      listResponseSchema(item).safeParse({ ...list, ...extra }).success
    ).toBe(false);
  }
});
it('infers the same types the schemas parse to', () => {
  expectTypeOf(successResponseSchema(item).parse(success)).toEqualTypeOf<
    SuccessResponse<{ id: string }>
  >();
  expectTypeOf(listResponseSchema(item).parse(list)).toEqualTypeOf<
    ListResponse<{ id: string }>
  >();
  expectTypeOf(pageSchema.parse(list.page)).toEqualTypeOf<Page>();
});
