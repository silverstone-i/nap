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
import {
  BulkFailedError,
  DirectoryError,
  directoryCode,
  withDirectoryErrors,
} from './errors.js';

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
 * @property {string|null} [homeTenantId] The tenant whose cell holds the actor's own roles (I0005); I0010-R011 compares it with `tenant.id`.
 * @property {string|null} [napsoftCode] Napsoft's tenant code, for M0003-R011 pattern coverage.
 * @property {() => Promise<string[]>} [actorPatterns] The actor's resolved grants (I0005).
 * @property {(change: object, tx: object) => Promise<void>} [recordRole] Writes a `role_change` outbox row inside `tx` (M0003-R015).
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

const bulkBody = z.strictObject({
  items: z
    .array(z.strictObject({ id: uuid, revision }))
    .min(1)
    .max(100),
});

/**
 * Apply a single-item write to every item of a bulk request in one cell
 * transaction (M0005-R030, R032). Each item runs in a savepoint so a
 * failure, including a database error, is recorded against that item alone;
 * if any item failed, the whole transaction rolls back and the caller gets
 * `BULK_FAILED` naming each failed item and its code, in request order.
 * Items are applied in ID order, so two bulk requests over the same rows
 * cannot deadlock.
 * @param {DirectoryContext} context
 * @param {unknown} body `{ items: [{ id, revision }] }`, 1 to 100 distinct IDs.
 * @param {(item: {id: string, revision: number}, tx: object) => Promise<{view: object, change: DirectoryChange}>} applyOne
 * @returns {Promise<{rows: object[]}>}
 * @throws {DirectoryError} `INVALID_INPUT`, `BULK_FAILED`
 */
export function bulkApply(context, body, applyOne) {
  const { items } = parse(bulkBody, body);
  if (new Set(items.map(item => item.id)).size !== items.length)
    throw new DirectoryError('INVALID_INPUT');
  const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id));
  return mutate(context, async tx => {
    const done = new Map();
    const failed = [];
    for (const item of ordered) {
      try {
        done.set(item.id, await tx.tx(savepoint => applyOne(item, savepoint)));
      } catch (error) {
        failed.push({ id: item.id, code: directoryCode(error) });
      }
    }
    if (failed.length) {
      const order = new Map(items.map((item, index) => [item.id, index]));
      failed.sort((a, b) => order.get(a.id) - order.get(b.id));
      throw new BulkFailedError(failed);
    }
    return {
      result: { rows: items.map(item => done.get(item.id).view) },
      changes: items.map(item => done.get(item.id).change),
    };
  });
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
