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
const listQuery = z.object({
  appliesTo: z.enum(LABEL_GROUPS).optional(),
  includeArchived: z.enum(['true', 'false']).optional(),
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
          includeArchived: input.includeArchived === 'true',
          orderBy: ['applies_to', 'name'],
        }
      )
    ).map(labelView)
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
 * Save one label revision and describe it.
 * @param {object} context
 * @param {unknown} id
 * @param {number} expected
 * @param {object} changes
 * @param {string} action
 * @returns {Promise<object>}
 */
function saveLabel(context, id, expected, changes, action) {
  return mutate(context, async tx => {
    const locked = await lockLabel(context, id, tx);
    requireRevision(locked, expected);
    const row = await context.cell.contact_labels.saveRevision(
      locked.id,
      changes,
      context.actorId,
      { tx }
    );
    const view = labelView(row);
    return {
      result: view,
      changes: [labelChange(action, labelView(locked), view)],
    };
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
    'renamed'
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
