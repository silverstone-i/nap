/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Tenant-defined tax ID formats (M0005-R036–R042). A name is unique
 * per country, archived formats included, so a clash is `CONFLICT`. Once a
 * record uses a format, an edit may change only its name and separators.
 */

import { isValidMask, sameSlots } from '@nap/shared';
import { z } from 'zod';
import { DirectoryError } from './errors.js';
import {
  bulkApply,
  mutate,
  parse,
  parseId,
  read,
  requireRevision,
  revision,
  revisionSchema,
} from './shared.js';

const formatName = z.string().trim().min(1).max(64);
const mask = z.string().refine(isValidMask);
const createSchema = z.strictObject({
  country: z.string().regex(/^[A-Z]{2}$/),
  name: formatName,
  mask,
});
const updateSchema = z.strictObject({ name: formatName, mask, revision });
// The list has no filters: it includes archived formats, which still
// format the tax IDs that use them (M0005 §10).
const listQuery = z.strictObject({});

/**
 * Safe projection of a tax ID format.
 * @param {object} row
 * @returns {{id: string, country: string, name: string, mask: string, archived: boolean, revision: number}}
 */
export function taxIdFormatView(row) {
  return {
    id: row.id,
    country: row.country,
    name: row.name,
    mask: row.mask,
    archived: row.deactivated_at != null,
    revision: row.revision,
  };
}

/**
 * A tax ID format change for the outbox (M0005-R025).
 * @param {string} action
 * @param {object|null} before
 * @param {object} after
 * @returns {import('./shared.js').DirectoryChange}
 */
function formatChange(action, before, after) {
  const shape = view =>
    view && JSON.stringify({ name: view.name, mask: view.mask });
  return {
    eventKey: `directory.tax_id_format.${action}`,
    recordId: after.id,
    details: {
      country: after.country,
      before: shape(before) ?? null,
      after: shape(after),
    },
  };
}

/**
 * The tenant's tax ID formats, archived ones included, by country and name.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} query
 * @returns {Promise<object[]>}
 */
export function listTaxIdFormats(context, query) {
  parse(listQuery, query);
  return read(context, async tx =>
    (
      await context.cell.tax_id_formats.rows(
        {},
        { tx, includeArchived: true, orderBy: ['country', 'name'] }
      )
    ).map(taxIdFormatView)
  );
}

/**
 * Refuse a name another format in the country already holds, archived
 * formats included (R036). When an archived format holds it, the `CONFLICT`
 * names that format so the screen can link to it (I0011-R010). Takes a lock
 * on the name first, so two writers of the same name cannot both pass.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {string} country
 * @param {string} name
 * @param {string|null} self The format being edited, which may keep its name.
 * @returns {Promise<void>}
 * @throws {DirectoryError} `CONFLICT`
 */
async function requireNameFree(context, tx, country, name, self) {
  await tx.one('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `business-directory:tax-id-format:${context.tenant.id}:${country}:${name}`,
  ]);
  const holder = (
    await context.cell.tax_id_formats.rows(
      { country, name },
      { tx, includeArchived: true }
    )
  ).find(row => row.id !== self);
  if (holder)
    throw new DirectoryError(
      'CONFLICT',
      holder.deactivated_at ? { id: holder.id, archived: true } : undefined
    );
}

/**
 * Create a tax ID format. An unknown country fails the foreign key, which
 * reports `INVALID_INPUT`.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function createTaxIdFormat(context, body) {
  const input = parse(createSchema, body);
  return mutate(context, async tx => {
    await requireNameFree(context, tx, input.country, input.name, null);
    const row = await context.cell.tax_id_formats.insert(
      {
        tenant_id: context.tenant.id,
        country: input.country,
        name: input.name,
        mask: input.mask,
        created_by: context.actorId,
        updated_by: context.actorId,
      },
      { tx }
    );
    const view = taxIdFormatView(row);
    return { result: view, changes: [formatChange('created', null, view)] };
  });
}

/**
 * Lock a tax ID format or report `NOT_FOUND`.
 * @param {object} context
 * @param {unknown} id
 * @param {object} tx
 * @returns {Promise<object>}
 */
async function lockFormat(context, id, tx) {
  const row = await context.cell.tax_id_formats.byKey(parseId(id), {
    tx,
    lock: true,
  });
  if (!row) throw new DirectoryError('NOT_FOUND');
  return row;
}

/**
 * Save one format revision inside `tx` and describe it.
 * @param {object} context
 * @param {object} tx
 * @param {unknown} id
 * @param {number} expected
 * @param {object} changes
 * @param {string} action
 * @param {(locked: object, tx: object) => void|Promise<void>} [guard] Refuses the change, such as a slot change to a used format.
 * @returns {Promise<{view: object, change: import('./shared.js').DirectoryChange}>}
 */
async function applyFormat(context, tx, id, expected, changes, action, guard) {
  const locked = await lockFormat(context, id, tx);
  requireRevision(locked, expected);
  await guard?.(locked, tx);
  const row = await context.cell.tax_id_formats.saveRevision(
    locked.id,
    changes,
    context.actorId,
    { tx }
  );
  const view = taxIdFormatView(row);
  return {
    view,
    change: formatChange(action, taxIdFormatView(locked), view),
  };
}

/**
 * Save one format revision in its own transaction.
 * @param {object} context
 * @param {unknown} id
 * @param {number} expected
 * @param {object} changes
 * @param {string} action
 * @param {(locked: object, tx: object) => void|Promise<void>} [guard] Passed to `applyFormat`.
 * @returns {Promise<object>}
 */
function saveFormat(context, id, expected, changes, action, guard) {
  return mutate(context, async tx => {
    const { view, change } = await applyFormat(
      context,
      tx,
      id,
      expected,
      changes,
      action,
      guard
    );
    return { result: view, changes: [change] };
  });
}

/**
 * Change a format's name or mask. Changing the slots of a format any record
 * uses fails with `INVALID_STATE`, because its stored tax IDs would no longer
 * fit (R041).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} id
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function updateTaxIdFormat(context, id, body) {
  const input = parse(updateSchema, body);
  return saveFormat(
    context,
    id,
    input.revision,
    { name: input.name, mask: input.mask },
    'updated',
    async (locked, tx) => {
      await requireNameFree(context, tx, locked.country, input.name, locked.id);
      if (
        !sameSlots(locked.mask, input.mask) &&
        (await context.cell.tax_id_formats.inUse(locked.id, { tx }))
      )
        throw new DirectoryError('INVALID_STATE');
    }
  );
}

/**
 * Archive a format. Tax IDs already using it keep it (R041).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} id
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function archiveTaxIdFormat(context, id, body) {
  const input = parse(revisionSchema, body);
  return saveFormat(
    context,
    id,
    input.revision,
    { archived: true },
    'archived'
  );
}

/**
 * Restore an archived format.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} id
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function restoreTaxIdFormat(context, id, body) {
  const input = parse(revisionSchema, body);
  return saveFormat(
    context,
    id,
    input.revision,
    { archived: false },
    'restored'
  );
}

/** M0005-R042: a bulk archive refuses an archived format, and a restore an active one. */
function requireArchived(archived) {
  return locked => {
    if ((locked.deactivated_at != null) !== archived)
      throw new DirectoryError('INVALID_STATE');
  };
}

/**
 * Archive several formats at once, all or nothing (M0005-R042).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} body `{ items: [{ id, revision }] }`
 * @returns {Promise<{rows: object[]}>}
 * @throws {DirectoryError} `INVALID_INPUT`, `BULK_FAILED`
 */
export function bulkArchiveTaxIdFormats(context, body) {
  return bulkApply(context, body, (item, tx) =>
    applyFormat(
      context,
      tx,
      item.id,
      item.revision,
      { archived: true },
      'archived',
      requireArchived(false)
    )
  );
}

/**
 * Restore several formats at once, all or nothing (M0005-R042).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} body `{ items: [{ id, revision }] }`
 * @returns {Promise<{rows: object[]}>}
 * @throws {DirectoryError} `INVALID_INPUT`, `BULK_FAILED`
 */
export function bulkRestoreTaxIdFormats(context, body) {
  return bulkApply(context, body, (item, tx) =>
    applyFormat(
      context,
      tx,
      item.id,
      item.revision,
      { archived: false },
      'restored',
      requireArchived(true)
    )
  );
}

/**
 * The active format a new or changed tax ID names (R038).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {string} id
 * @returns {Promise<object>} The format row.
 * @throws {DirectoryError} `INVALID_INPUT` when it is unknown or archived.
 */
export async function activeTaxIdFormat(context, tx, id) {
  const row = await context.cell.tax_id_formats.byKey(id, { tx });
  if (!row || row.deactivated_at) throw new DirectoryError('INVALID_INPUT');
  return row;
}
