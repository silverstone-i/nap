/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Does: Declares the members of the organization-owned workbook library the
 * API uses, since the package ships JavaScript with no type declarations.
 * Used by: the framework's spreadsheet conversion only.
 * Why: strict TypeScript refuses an untyped import; adding declarations to
 * the library itself is the upstream follow-up, and these stay minimal so
 * they are easy to drop then.
 */
declare module '@nap-sft/tablsx' {
  /** Does: Represents one cell: its value, formula, and normalized type. */
  export type Cell = {
    value: unknown;
    formula: string | null;
    type: string;
  };
  /** Does: Represents one worksheet: its name and row-major cells. */
  export type Worksheet = { name: string; rows: Cell[][] };
  /** Does: Represents one workbook: its worksheets in order. */
  export type Workbook = { sheets: Worksheet[] };
  /** Does: Parses workbook bytes into the normalized workbook model. */
  export function readXlsx(buffer: Uint8Array): Workbook;
  /** Does: Serializes the normalized workbook model into workbook bytes. */
  export function writeXlsx(workbook: Workbook): Uint8Array;
  /** Does: Builds a workbook from worksheets. */
  export function createWorkbook(sheets?: Worksheet[]): Workbook;
  /** Does: Converts a worksheet into objects keyed by its header row. */
  export function rowsFromSheet(sheet: Worksheet): Record<string, unknown>[];
  /** Does: Converts objects into a worksheet whose header row is their keys. */
  export function sheetFromRows(
    rows: Record<string, unknown>[],
    options?: { name?: string }
  ): Worksheet;
}
