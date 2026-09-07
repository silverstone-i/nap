/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import { importRowLimit } from '@nap/shared';
import { HttpError } from '../../src/util/httpError.js';
import {
  recordsFromWorkbook,
  workbookFromRecords,
} from '../../src/framework/spreadsheets.js';

/** Does: Runs a conversion and returns the field-error keys it refused with. */
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

it('round-trips records through workbook bytes in memory', () => {
  const records = [
    {
      code: 'a',
      name: 'Alpha',
      quantity: 1,
      when: new Date('2026-01-02T00:00:00.000Z'),
    },
    { code: 'b', name: 'Beta', quantity: null, when: null },
  ];
  const bytes = workbookFromRecords(
    records,
    'a-very-long-router-name-beyond-thirty-one-characters'
  );
  expect(bytes.length).toBeGreaterThan(0);
  const read = recordsFromWorkbook(bytes, 0);
  expect(read).toHaveLength(2);
  expect(read[0]).toMatchObject({ code: 'a', name: 'Alpha', quantity: 1 });
  expect(read[0]?.when).toBeInstanceOf(Date);
  expect(read[1]).toEqual({
    code: 'b',
    name: 'Beta',
    quantity: null,
    when: null,
  });
  const sparse = recordsFromWorkbook(
    workbookFromRecords(
      [
        { code: 'a', id: null, quantity: null },
        { code: 'b', id: null, quantity: 2 },
      ],
      'records'
    ),
    0
  );
  expect(sparse).toEqual([
    { code: 'a', quantity: null },
    { code: 'b', quantity: 2 },
  ]);
});

it('refuses unreadable bytes, a missing sheet, an empty sheet, and too many rows', () => {
  expect(refusal(() => recordsFromWorkbook(Buffer.from('nope'), 0))).toEqual([
    '',
  ]);
  const one = workbookFromRecords([{ code: 'a' }], 'records');
  expect(refusal(() => recordsFromWorkbook(one, 1))).toEqual(['sheet']);
  expect(
    refusal(() => recordsFromWorkbook(workbookFromRecords([], 'records'), 0))
  ).toEqual(['']);
  const many = workbookFromRecords(
    Array.from({ length: importRowLimit + 1 }, (_, index) => ({
      code: String(index),
    })),
    'records'
  );
  expect(refusal(() => recordsFromWorkbook(many, 0))).toEqual(['']);
});
