/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError } from '../../src/util/httpError.js';
import {
  checkRecordColumns,
  parseAt,
  parseRecord,
  withTenant,
} from '../../src/framework/recordInput.js';
import type { ModelContract } from '../../src/framework/modelContract.js';

const contract: ModelContract = {
  repository: 'records',
  primaryKey: 'id',
  columns: new Set([
    'id',
    'tenant_id',
    'code',
    'name',
    'created_at',
    'deactivated_at',
  ]),
  managed: new Set(['tenant_id', 'created_at', 'deactivated_at']),
  immutable: new Set(['id', 'tenant_id', 'created_at', 'deactivated_at']),
  softDelete: true,
  writable: true,
  itemSchema: z.object({}),
  columnSchema: () => z.string(),
};

/** Does: Runs a check and returns the field errors it refused with. */
function refusal(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpError && error.code === 'INVALID_INPUT')
      return error.fieldErrors;
    throw error;
  }
  throw new Error('Expected a refusal');
}

it('refuses unknown, managed, and, on update, immutable columns by dotted path', () => {
  expect(
    refusal(() =>
      checkRecordColumns({ nope: 1 }, 'records.2', contract, 'insert')
    )
  ).toEqual({ 'records.2.nope': ['Unknown column'] });
  expect(
    refusal(() => checkRecordColumns({ created_at: 1 }, '', contract, 'insert'))
  ).toEqual({ created_at: ['Managed column'] });
  expect(
    refusal(() =>
      checkRecordColumns({ tenant_id: 'x' }, '', contract, 'insert')
    )
  ).toEqual({ tenant_id: ['Managed column'] });
  expect(
    refusal(() =>
      checkRecordColumns({ id: 'x' }, 'changes', contract, 'update')
    )
  ).toEqual({ 'changes.id': ['Immutable column'] });
  expect(
    checkRecordColumns({ id: 'x', code: 'c' }, '', contract, 'insert')
  ).toEqual({ id: 'x', code: 'c' });
  expect(
    refusal(() => checkRecordColumns(['x'], 'records.0', contract, 'insert'))
  ).toEqual({ 'records.0': ['Expected an object'] });
});

it('adds the tenant and places schema issues under the given prefix', () => {
  expect(withTenant({ code: 'c' }, 't')).toEqual({ code: 'c', tenant_id: 't' });
  const schema = z.object({ code: z.string(), quantity: z.number() });
  expect(refusal(() => parseAt(schema, { code: 1 }, 'records.0'))).toEqual({
    'records.0.code': [expect.any(String)],
    'records.0.quantity': [expect.any(String)],
  });
  expect(refusal(() => parseAt(z.string(), 5, 'id'))).toEqual({
    id: [expect.any(String)],
  });
  expect(refusal(() => parseAt(z.string(), 5))).toEqual({
    '': [expect.any(String)],
  });
  expect(parseAt(schema, { code: 'c', quantity: 1 })).toEqual({
    code: 'c',
    quantity: 1,
  });
});

it('returns the value a record validator produced, coercions included', () => {
  const schema = z.object({
    code: z.string(),
    when: z.union([z.date(), z.string(), z.number()]).pipe(z.coerce.date()),
  });
  const parsed = parseRecord(schema, { code: 'c', when: 1700000000000 });
  expect(parsed.when).toBeInstanceOf(Date);
  expect(parsed.code).toBe('c');
  expect(refusal(() => parseRecord(schema, { code: 1 }, 'records.0'))).toEqual({
    'records.0.code': [expect.any(String)],
    'records.0.when': [expect.any(String)],
  });
  expect(() => parseRecord(z.string(), { code: 'c' })).toThrow();
});
