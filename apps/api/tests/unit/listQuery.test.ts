/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError } from '../../src/util/httpError.js';
import {
  decodeCursor,
  encodeCursor,
  parseListQuery,
} from '../../src/framework/listQuery.js';
import type { ModelContract } from '../../src/framework/modelContract.js';

const columnSchemas: Record<string, z.ZodType> = {
  id: z.guid(),
  code: z.string(),
  quantity: z.number().nullable(),
  created_at: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
};
const contract: ModelContract = {
  repository: 'records',
  primaryKey: 'id',
  columns: new Set([
    'id',
    'tenant_id',
    'code',
    'quantity',
    'created_at',
    'deactivated_at',
  ]),
  managed: new Set(['tenant_id']),
  immutable: new Set(['id', 'tenant_id']),
  softDelete: true,
  writable: true,
  itemSchema: z.object({}),
  columnSchema: name => columnSchemas[name] ?? z.string(),
};
const limits = { default: 50, max: 500 };

/** Does: Runs a parse and returns the field-error keys it refused with. */
function refusal(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpError && error.code === 'INVALID_INPUT')
      return Object.keys(error.fieldErrors ?? {});
    throw error;
  }
  throw new Error('Expected a refusal');
}

it('applies defaults, clamps the size, and appends the key to the sort', () => {
  expect(parseListQuery({}, contract, limits)).toEqual({
    size: 50,
    sort: '',
    orderBy: ['id'],
    descending: false,
    archived: 'exclude',
    filters: {},
  });
  const parsed = parseListQuery(
    {
      size: '900',
      sort: '-code,created_at',
      archived: 'only',
      code: 'a',
      quantity: ['1', '2'],
    },
    contract,
    limits
  );
  expect(parsed.size).toBe(500);
  expect(parsed.orderBy).toEqual(['code', 'created_at', 'id']);
  expect(parsed.descending).toBe(true);
  expect(parsed.filters).toEqual({
    code: 'a',
    quantity: { $in: ['1', '2'] },
    deactivated_at: { $ne: null },
  });
  expect(parseListQuery({ sort: 'id' }, contract, limits).orderBy).toEqual([
    'id',
  ]);
});

it('refuses bad sizes, unknown or repeated sort columns, unknown filters, and bad values', () => {
  expect(
    refusal(() => parseListQuery({ size: '0' }, contract, limits))
  ).toEqual(['size']);
  expect(
    refusal(() => parseListQuery({ sort: 'nope' }, contract, limits))
  ).toEqual(['sort']);
  expect(
    refusal(() => parseListQuery({ sort: 'code,code' }, contract, limits))
  ).toEqual(['sort']);
  expect(
    refusal(() => parseListQuery({ nope: 'x' }, contract, limits))
  ).toEqual(['nope']);
  expect(
    refusal(() => parseListQuery({ code: { deep: 'x' } }, contract, limits))
  ).toEqual(['code']);
  expect(
    refusal(() => parseListQuery({ archived: 'all' }, contract, limits))
  ).toEqual(['archived']);
  expect(
    refusal(() =>
      parseListQuery(
        { archived: 'only' },
        { ...contract, softDelete: false },
        limits
      )
    )
  ).toEqual(['archived']);
});

it('round-trips a cursor and refuses one from another sort, selector, or shape', () => {
  const request = parseListQuery({ sort: '-created_at' }, contract, limits);
  const last = {
    created_at: new Date('2026-01-02T03:04:05.000Z'),
    id: '0f1e2d3c-4b5a-4978-8f6e-5d4c3b2a1908',
    code: 'x',
  };
  const cursor = encodeCursor(last, request);
  expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeCursor(cursor, request, contract)).toEqual({
    created_at: last.created_at,
    id: last.id,
  });
  expect(
    parseListQuery({ sort: '-created_at', cursor }, contract, limits).cursor
  ).toEqual({ created_at: last.created_at, id: last.id });
  /** Does: Encodes a raw cursor object the way a tampering client would. */
  const raw = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  for (const query of [
    { cursor },
    { sort: '-created_at', archived: 'include', cursor },
    { sort: '-created_at', cursor: 'not base64 json' },
    {
      sort: '-created_at',
      cursor: raw({ s: '-created_at', a: 'exclude', k: ['x'] }),
    },
    {
      sort: '-created_at',
      cursor: raw({
        s: '-created_at',
        a: 'exclude',
        k: ['2026-01-01', 'nope'],
      }),
    },
  ]) {
    expect(refusal(() => parseListQuery(query, contract, limits))).toEqual([
      'cursor',
    ]);
  }
});
