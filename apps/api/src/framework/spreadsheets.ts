/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  createWorkbook,
  readXlsx,
  rowsFromSheet,
  sheetFromRows,
  writeXlsx,
} from '@nap-sft/tablsx';
import { importRowLimit } from '@nap/shared';
import { HttpError } from '../util/httpError.js';
import { fieldError } from '../util/fieldErrors.js';
import type { Row } from './modelContract.js';

/**
 * Does: Reads the records of one sheet of a workbook, the first row as the
 * column names, from the workbook's bytes.
 * Called by: the import handler, after the body reader has stored the bytes.
 * Why: this is the only place the workbook library is used for reading, and
 * every failure it can raise becomes a fixed INVALID_INPUT so library text
 * never reaches the client. A sheet with more data rows than the import
 * limit is refused whole, because an import is one all-or-nothing batch. A
 * column left blank in every row is omitted so the table's default applies;
 * a blank cell in a column that has values elsewhere stays null, so every
 * record carries the same columns, which one multi-row insert requires.
 * @throws HttpError INVALID_INPUT for unreadable bytes, a missing sheet, an
 * empty sheet, or too many rows.
 */
export function recordsFromWorkbook(bytes: Uint8Array, sheet: number): Row[] {
  let sheets;
  try {
    sheets = readXlsx(bytes).sheets;
  } catch {
    throw new HttpError('INVALID_INPUT', fieldError('', 'Unreadable workbook'));
  }
  const worksheet = sheets[sheet];
  if (!worksheet) {
    throw new HttpError('INVALID_INPUT', fieldError('sheet', 'No such sheet'));
  }
  const rows = rowsFromSheet(worksheet);
  if (rows.length === 0) {
    throw new HttpError(
      'INVALID_INPUT',
      fieldError('', 'Sheet has no records')
    );
  }
  if (rows.length > importRowLimit) {
    throw new HttpError('INVALID_INPUT', fieldError('', 'Too many records'));
  }
  const blank = new Set(
    Object.keys(rows[0] ?? {}).filter(column =>
      rows.every(row => row[column] === null)
    )
  );
  return rows.map(row =>
    Object.fromEntries(
      Object.entries(row).filter(([column]) => !blank.has(column))
    )
  );
}

/**
 * Does: Writes records into one sheet of a new workbook and returns the
 * workbook's bytes.
 * Called by: the export handler.
 * Why: this is the only place the workbook library is used for writing. The
 * sheet name is cut to the 31 characters a workbook allows.
 */
export function workbookFromRecords(records: Row[], name: string): Uint8Array {
  const sheet = sheetFromRows(records, { name: name.slice(0, 31) || 'Sheet1' });
  return writeXlsx(createWorkbook([sheet]));
}
