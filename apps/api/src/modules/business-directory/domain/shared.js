/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Shared plumbing for the directory rules: input parsing, the tenant
 * transaction that records a change in the same transaction (M0005-R025),
 * and optimistic concurrency on `revision`.
 */

import { z } from 'zod';
import { withTenantTransaction } from '../../../infrastructure/runtime/tenantTransaction.js';
import { DirectoryError, withDirectoryErrors } from './errors.js';

/**
 * @typedef {object} DirectoryChange
 * @property {string} eventKey Such as `directory.record.created`.
 * @property {string} recordId The changed row's key.
 * @property {Record<string, string|number|null>} details Masked; never a full tax ID.
 */

/**
 * @typedef {object} DirectoryContext
 * @property {object} cell Target tenant's cell repository handle.
 * @property {{id: string, isNapsoft?: boolean}} tenant Target tenant.
 * @property {object} [hashingPolicy] Argon2id parameters for temporary passwords; the environment's when absent.
 * @property {string} actorId Acting portal user.
 * @property {ReturnType<typeof import('./taxIds.js').createTaxIdProtector>} taxIds
 * @property {(capability: string) => Promise<boolean>} can Whether the actor holds `business-directory::<router>::<action>` in the target tenant.
 * @property {(change: DirectoryChange, tx: object) => Promise<void>} record Writes the change's outbox row inside `tx`.
 */

export const uuid = z.uuid();
export const revision = z.number().int().positive();
export const revisionSchema = z.strictObject({ revision });

/**
 * Parse `value` with `schema` or report `INVALID_INPUT`.
 * @template T
 * @param {z.ZodType<T>} schema
 * @param {unknown} value
 * @returns {T}
 * @throws {DirectoryError} `INVALID_INPUT`
 */
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new DirectoryError('INVALID_INPUT');
  return result.data;
}

/**
 * Parse a path identifier; a malformed one is simply not found.
 * @param {unknown} value
 * @returns {string}
 * @throws {DirectoryError} `NOT_FOUND`
 */
export function parseId(value) {
  const result = uuid.safeParse(value);
  if (!result.success) throw new DirectoryError('NOT_FOUND');
  return result.data;
}

/**
 * Reject a write whose expected revision is not the stored one.
 * @param {{revision: number}} row
 * @param {number} expected
 * @returns {void}
 * @throws {DirectoryError} `STALE_REVISION`
 */
export function requireRevision(row, expected) {
  if (row.revision !== expected) throw new DirectoryError('STALE_REVISION');
}

/**
 * Turn search text into a case-insensitive contains pattern, escaping the
 * `LIKE` wildcards so they match literally.
 * @param {string|undefined} text
 * @returns {string|null}
 */
export function containsPattern(text) {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return `%${trimmed.replace(/[\\%_]/g, c => `\\${c}`)}%`;
}

/**
 * Run a read in a cell transaction scoped to the target tenant.
 * @template T
 * @param {DirectoryContext} context
 * @param {(tx: object) => Promise<T>} operation
 * @returns {Promise<T>}
 */
export function read(context, operation) {
  return withDirectoryErrors(() =>
    withTenantTransaction(context.cell, context.tenant.id, operation)
  );
}

/**
 * Run a write in a cell transaction scoped to the target tenant and record
 * the changes it returns in the same transaction.
 * @template T
 * @param {DirectoryContext} context
 * @param {(tx: object) => Promise<{result: T, changes?: DirectoryChange[]}>} operation
 * @returns {Promise<T>}
 */
export function mutate(context, operation) {
  return withDirectoryErrors(() =>
    withTenantTransaction(context.cell, context.tenant.id, async tx => {
      const { result, changes = [] } = await operation(tx);
      for (const change of changes) await context.record(change, tx);
      return result;
    })
  );
}

/**
 * Require a capability the route did not already check, such as
 * `tax-ids::write` when a request carries a tax ID (M0005-R012).
 * @param {DirectoryContext} context
 * @param {string} capability `business-directory::<router>::<action>`
 * @returns {Promise<void>}
 * @throws {DirectoryError} `FORBIDDEN`
 */
export async function requireCapability(context, capability) {
  if (!(await context.can(capability))) throw new DirectoryError('FORBIDDEN');
}

export const TAX_IDS_READ = 'business-directory::tax-ids::read';
export const TAX_IDS_WRITE = 'business-directory::tax-ids::write';
