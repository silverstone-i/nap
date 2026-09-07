/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import {
  archivedSelectors,
  exportRowLimit,
  importQuerySchema,
  importRowLimit,
  importUploadLimitBytes,
  listPageSize,
  listParameterNames,
  listQuerySchema,
  sortExpression,
  xlsxMediaType,
} from '@nap/shared';

it('pins the list, export, and import bounds', () => {
  expect(listPageSize).toEqual({ default: 50, max: 500 });
  expect(exportRowLimit).toBe(5000);
  expect(importRowLimit).toBe(5000);
  expect(importUploadLimitBytes).toBe(5 * 1024 * 1024);
  expect(listParameterNames).toEqual(['size', 'sort', 'cursor', 'archived']);
  expect(archivedSelectors).toEqual(['exclude', 'only', 'include']);
  expect(xlsxMediaType).toBe(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

it('coerces the reserved list parameters and keeps other keys as filters', () => {
  const parsed = listQuerySchema.parse({
    size: '20',
    sort: '-name,code',
    cursor: 'abc',
    name: 'x',
  });
  expect(parsed).toEqual({
    size: 20,
    sort: '-name,code',
    cursor: 'abc',
    archived: 'exclude',
    name: 'x',
  });
  expect(listQuerySchema.parse({ archived: 'only' }).archived).toBe('only');
});

it('rejects a bad size, sort, cursor, or archived selector', () => {
  for (const query of [
    { size: '0' },
    { size: '1.5' },
    { size: 'ten' },
    { sort: 'name desc' },
    { sort: 'name,-code' },
    { sort: 'Name' },
    { sort: '' },
    { cursor: '' },
    { archived: 'all' },
  ]) {
    expect(listQuerySchema.safeParse(query).success).toBe(false);
  }
  expect(sortExpression.test('-created_at,id')).toBe(true);
  expect(sortExpression.test('1abc')).toBe(false);
});

it('reads the import sheet index and refuses other query keys', () => {
  expect(importQuerySchema.parse({})).toEqual({ sheet: 0 });
  expect(importQuerySchema.parse({ sheet: '2' })).toEqual({ sheet: 2 });
  for (const query of [{ sheet: '-1' }, { sheet: 'a' }, { name: 'x' }]) {
    expect(importQuerySchema.safeParse(query).success).toBe(false);
  }
});
