/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { AdminAccessError } from './errors.js';

const uuidSchema = z.uuid();
const limitSchema = z.number().int().min(1).max(100);
const normalizedEmailSchema = z
  .string()
  .min(1)
  .max(254)
  .email()
  .refine(value => value === value.toLowerCase());

/**
 * Parse a Zod schema, translating any failure to `INVALID_INPUT`.
 * @param {import('zod').ZodType} schema
 * @param {unknown} value
 * @returns {unknown} The parsed, validated value.
 * @throws {AdminAccessError} `INVALID_INPUT`
 */
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new AdminAccessError('INVALID_INPUT');
  return result.data;
}

/**
 * Validate a UUID argument.
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminAccessError} `INVALID_INPUT`
 */
export function parseUuid(value) {
  return parse(uuidSchema, value);
}

/**
 * Validate a list page limit, defaulting to 50 when omitted.
 * @param {unknown} value
 * @returns {number} An integer from 1 to 100.
 * @throws {AdminAccessError} `INVALID_INPUT`
 */
export function parseLimit(value) {
  return value === undefined ? 50 : parse(limitSchema, value);
}

/**
 * Validate an email already normalized to lowercase by the caller.
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminAccessError} `INVALID_INPUT`
 */
export function parseNormalizedEmail(value) {
  return parse(normalizedEmailSchema, value);
}
