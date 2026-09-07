/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

/**
 * Does: Holds the media type of a workbook, sent as the body of an import
 * request and returned by an export.
 * Used by: the framework's spreadsheet routes and clients.
 * Why: the framework HTTP contract names this type for the raw upload body;
 * the API parses no multipart form.
 */
export const xlsxMediaType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Does: Holds the largest workbook body an import accepts, in bytes.
 * Used by: the API's workbook body reader and clients.
 * Why: the ceiling is checked before the body is read (framework HTTP
 * contract).
 */
export const importUploadLimitBytes = 5 * 1024 * 1024;

/**
 * Does: Holds the most data rows one imported sheet may carry.
 * Used by: the framework's import route.
 * Why: an import is one all-or-nothing batch, bounded like any batch write.
 */
export const importRowLimit = 5000;

/**
 * Does: Describes the query parameters of an import request: the index of
 * the sheet to load, starting at zero.
 * Used by: the framework's import route and clients.
 */
export const importQuerySchema = z.strictObject({
  sheet: z.coerce.number().int().min(0).default(0),
});
