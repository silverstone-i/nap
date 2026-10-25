/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Shared plumbing for the settings rules: input parsing, the tenant
 * transaction that records a change in the same transaction, and optimistic
 * concurrency on `revision`.
 */

import { withTenantTransaction } from '../../../infrastructure/runtime/tenantTransaction.js';
import { SettingsError, withSettingsErrors } from './errors.js';

/**
 * @typedef {object} SettingsChange
 * @property {string} eventKey Such as `tenant_settings.updated`.
 * @property {Record<string, string|number|null>} details
 */

/**
 * @typedef {object} SettingsContext
 * @property {object} cell Target tenant's cell repository handle.
 * @property {{id: string}} tenant Target tenant.
 * @property {string} actorId Acting portal user.
 * @property {(change: SettingsChange, tx: object) => Promise<void>} record Writes the change's outbox row inside `tx`.
 */

/**
 * Parse `value` with `schema` or report `INVALID_INPUT`.
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {unknown} value
 * @returns {T}
 * @throws {SettingsError} `INVALID_INPUT`
 */
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new SettingsError('INVALID_INPUT');
  return result.data;
}

/**
 * Run a read in a cell transaction scoped to the target tenant.
 * @template T
 * @param {SettingsContext} context
 * @param {(tx: object) => Promise<T>} operation
 * @returns {Promise<T>}
 */
export function read(context, operation) {
  return withSettingsErrors(() =>
    withTenantTransaction(context.cell, context.tenant.id, operation)
  );
}

/**
 * Run a write in a cell transaction scoped to the target tenant and record
 * the changes it returns in the same transaction.
 * @template T
 * @param {SettingsContext} context
 * @param {(tx: object) => Promise<{result: T, changes?: SettingsChange[]}>} operation
 * @returns {Promise<T>}
 */
export function mutate(context, operation) {
  return withSettingsErrors(() =>
    withTenantTransaction(context.cell, context.tenant.id, async tx => {
      const { result, changes = [] } = await operation(tx);
      for (const change of changes) await context.record(change, tx);
      return result;
    })
  );
}
