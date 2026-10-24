/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Tenant-defined labels for emails, phones, and addresses
 * (M0005-R017). A name is unique per group, archived labels included, so a
 * clash is `CONFLICT`.
 */

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

/** Label groups (R017). */
export const LABEL_GROUPS = Object.freeze(['email', 'phone', 'address']);

const labelName = z.string().trim().min(1).max(64);
const createSchema = z.strictObject({
  appliesTo: z.enum(LABEL_GROUPS),
  name: labelName,
});
const updateSchema = z.strictObject({ name: labelName, revision });
// Strict, so the old `includeArchived` is refused (I0011-R009).
const listQuery = z.strictObject({
  appliesTo: z.enum(LABEL_GROUPS).optional(),
  archived: z.enum(['true', 'false']).optional(),
});

/**
 * Safe projection of a label.
 * @param {object} row
 * @returns {{id: string, appliesTo: string, name: string, archived: boolean, revision: number}}
 */
export function labelView(row) {
  return {
    id: row.id,
    appliesTo: row.applies_to,
    name: row.name,
    archived: row.deactivated_at != null,
    revision: row.revision,
  };
}

/**
 * A label change for the outbox.
 * @param {string} action
 * @param {object|null} before
 * @param {object} after
 * @returns {import('./shared.js').DirectoryChange}
 */
function labelChange(action, before, after) {
  return {
    eventKey: `directory.label.${action}`,
    recordId: after.id,
    details: {
      applies_to: after.appliesTo,
      before: before?.name ?? null,
      after: after.name,
    },
  };
}

/**
 * The tenant's labels, by group and name.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} query
 * @returns {Promise<object[]>}
 */
export function listLabels(context, query) {
  const input = parse(listQuery, query);
  return read(context, async tx =>
    (
      await context.cell.contact_labels.rows(
        input.appliesTo ? { applies_to: input.appliesTo } : {},
        {
          tx,
          archived: input.archived === 'true',
          orderBy: ['applies_to', 'name'],
        }
      )
    ).map(labelView)
  );
}

/**
 * Refuse a name another label in the group already holds, archived labels
 * included (R017). When an archived label holds it, the `CONFLICT` names
 * that label so the screen can link to it (I0011-R010). Takes a lock on the
 * name first, so two writers of the same name cannot both pass.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {string} appliesTo
 * @param {string} name
 * @param {string|null} self The label being renamed, which may keep its name.
 * @returns {Promise<void>}
 * @throws {DirectoryError} `CONFLICT`
 */
async function requireNameFree(context, tx, appliesTo, name, self) {
  await tx.one('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `business-directory:label:${context.tenant.id}:${appliesTo}:${name}`,
  ]);
  const holder = (
    await context.cell.contact_labels.rows(
      { applies_to: appliesTo, name },
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
 * Create a label.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function createLabel(context, body) {
  const input = parse(createSchema, body);
  return mutate(context, async tx => {
    await requireNameFree(context, tx, input.appliesTo, input.name, null);
    const row = await context.cell.contact_labels.insert(
      {
        tenant_id: context.tenant.id,
        applies_to: input.appliesTo,
        name: input.name,
        created_by: context.actorId,
        updated_by: context.actorId,
      },
      { tx }
    );
    const view = labelView(row);
    return { result: view, changes: [labelChange('created', null, view)] };
  });
}

/**
 * Lock a label or report `NOT_FOUND`.
 * @param {object} context
 * @param {unknown} id
 * @param {object} tx
 * @returns {Promise<object>}
 */
async function lockLabel(context, id, tx) {
  const row = await context.cell.contact_labels.byKey(parseId(id), {
    tx,
    lock: true,
  });
  if (!row) throw new DirectoryError('NOT_FOUND');
  return row;
}

/**
 * Save one label revision inside `tx` and describe it.
 * @param {object} context
 * @param {object} tx
 * @param {unknown} id
 * @param {number} expected
 * @param {object} changes
 * @param {string} action
 * @param {(locked: object, tx: object) => void|Promise<void>} [guard] Refuses the change, such as archiving an archived label.
 * @returns {Promise<{view: object, change: import('./shared.js').DirectoryChange}>}
 */
async function applyLabel(context, tx, id, expected, changes, action, guard) {
  const locked = await lockLabel(context, id, tx);
  requireRevision(locked, expected);
  await guard?.(locked, tx);
  const row = await context.cell.contact_labels.saveRevision(
    locked.id,
    changes,
    context.actorId,
    { tx }
  );
  const view = labelView(row);
  return { view, change: labelChange(action, labelView(locked), view) };
}

/**
 * Save one label revision in its own transaction.
 * @param {object} context
 * @param {unknown} id
 * @param {number} expected
 * @param {object} changes
 * @param {string} action
 * @param {(locked: object, tx: object) => void|Promise<void>} [guard] Passed to `applyLabel`.
 * @returns {Promise<object>}
 */
function saveLabel(context, id, expected, changes, action, guard) {
  return mutate(context, async tx => {
    const { view, change } = await applyLabel(
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
 * Rename a label.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} id
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function renameLabel(context, id, body) {
  const input = parse(updateSchema, body);
  return saveLabel(
    context,
    id,
    input.revision,
    { name: input.name },
    'renamed',
    (locked, tx) =>
      requireNameFree(context, tx, locked.applies_to, input.name, locked.id)
  );
}

/**
 * Archive a label. Rows already using it keep it.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} id
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function archiveLabel(context, id, body) {
  const input = parse(revisionSchema, body);
  return saveLabel(context, id, input.revision, { archived: true }, 'archived');
}

/**
 * Restore an archived label.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} id
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function restoreLabel(context, id, body) {
  const input = parse(revisionSchema, body);
  return saveLabel(
    context,
    id,
    input.revision,
    { archived: false },
    'restored'
  );
}

/** M0005-R032: a bulk archive refuses an archived label, and a restore an active one. */
function requireArchived(archived) {
  return locked => {
    if ((locked.deactivated_at != null) !== archived)
      throw new DirectoryError('INVALID_STATE');
  };
}

/**
 * Archive several labels at once, all or nothing (M0005-R032).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} body `{ items: [{ id, revision }] }`
 * @returns {Promise<{rows: object[]}>}
 * @throws {DirectoryError} `INVALID_INPUT`, `BULK_FAILED`
 */
export function bulkArchiveLabels(context, body) {
  return bulkApply(context, body, (item, tx) =>
    applyLabel(
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
 * Restore several labels at once, all or nothing (M0005-R032).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} body `{ items: [{ id, revision }] }`
 * @returns {Promise<{rows: object[]}>}
 * @throws {DirectoryError} `INVALID_INPUT`, `BULK_FAILED`
 */
export function bulkRestoreLabels(context, body) {
  return bulkApply(context, body, (item, tx) =>
    applyLabel(
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
