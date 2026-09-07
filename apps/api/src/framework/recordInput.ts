/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { HttpError } from '../util/httpError.js';
import { fieldError, toFieldErrors } from '../util/fieldErrors.js';
import type { z } from 'zod';
import type { ModelContract, Row } from './modelContract.js';

/**
 * Does: Joins a path prefix and a key into one dotted path.
 * Called by: the checks below when they name a field.
 */
function at(prefix: string, key: string) {
  return prefix ? `${prefix}.${key}` : key;
}

/**
 * Does: Checks a value against a schema and returns the checked value, or
 * throws INVALID_INPUT with per-field messages placed under the given path.
 * Called by: the framework handlers for every body, query, and parameter.
 * Why: the messages are Zod's own and never echo the received value.
 * @throws HttpError INVALID_INPUT when the value fails the schema.
 */
export function parseAt<T extends z.ZodType>(
  schema: T,
  value: unknown,
  prefix = ''
): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fieldErrors = toFieldErrors(result.error.issues);
  if (!prefix) throw new HttpError('INVALID_INPUT', fieldErrors);
  throw new HttpError(
    'INVALID_INPUT',
    Object.fromEntries(
      Object.entries(fieldErrors).map(([path, messages]) => [
        path ? at(prefix, path) : prefix,
        messages,
      ])
    )
  );
}

/**
 * Does: Checks that a record is a plain object whose keys are all columns a
 * client may write, and returns it as a row.
 * Called by: the create, batch, and import handlers for every record before
 * the model's own validator runs.
 * Why: the generated validators drop unknown keys silently, so an unknown,
 * server-managed, or, on update, immutable column must be refused here or a
 * mistyped field would be ignored rather than reported. The tenant column is
 * refused earlier by rejectTenantInput; it is refused again here so the rule
 * does not depend on middleware order.
 * @throws HttpError INVALID_INPUT naming the offending key.
 */
export function checkRecordColumns(
  record: unknown,
  path: string,
  contract: ModelContract,
  mode: 'insert' | 'update'
): Row {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    throw new HttpError(
      'INVALID_INPUT',
      fieldError(path, 'Expected an object')
    );
  }
  for (const key of Object.keys(record)) {
    if (!contract.columns.has(key)) {
      throw new HttpError(
        'INVALID_INPUT',
        fieldError(at(path, key), 'Unknown column')
      );
    }
    if (contract.managed.has(key)) {
      throw new HttpError(
        'INVALID_INPUT',
        fieldError(at(path, key), 'Managed column')
      );
    }
    if (mode === 'update' && contract.immutable.has(key)) {
      throw new HttpError(
        'INVALID_INPUT',
        fieldError(at(path, key), 'Immutable column')
      );
    }
  }
  return { ...record };
}

/**
 * Does: Returns a copy of a record with the active tenant written into its
 * tenant column.
 * Called by: the create, bulk-insert, and import handlers.
 * Why: the tenant value comes from the resolved session and nowhere else
 * (ARCH-022); the row-level policy still checks it on insert.
 */
export function withTenant(record: Row, tenantId: string): Row {
  return { ...record, tenant_id: tenantId };
}
