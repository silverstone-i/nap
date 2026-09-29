/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Emails, phones, and addresses of any directory record
 * (M0005-R014–R016). Making one primary demotes the party's previous
 * primary of the same type in the same transaction; an employee always
 * keeps a primary email (R016).
 */

import { z } from 'zod';
import { DirectoryError } from './errors.js';
import {
  mutate,
  parse,
  parseId,
  requireRevision,
  revision,
  uuid,
} from './shared.js';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+().\- x]{3,32}$/);
const labelId = uuid.nullable();

const methodCreate = z.strictObject({
  type: z.enum(['email', 'phone']),
  value: z.string(),
  labelId: labelId.optional(),
  isPrimary: z.boolean().optional(),
});
const methodUpdate = z.strictObject({
  value: z.string().optional(),
  labelId: labelId.optional(),
  isPrimary: z.boolean().optional(),
  revision,
});
const line = z.string().trim().min(1).max(255);
const addressFields = {
  line1: line,
  line2: line.nullable(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120).nullable(),
  postalCode: z.string().trim().min(1).max(32).nullable(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  labelId,
  isPrimary: z.boolean(),
};
const addressCreate = z.strictObject({
  line1: addressFields.line1,
  line2: addressFields.line2.optional(),
  city: addressFields.city,
  region: addressFields.region.optional(),
  postalCode: addressFields.postalCode.optional(),
  country: addressFields.country,
  labelId: labelId.optional(),
  isPrimary: z.boolean().optional(),
});
const addressUpdate = z.strictObject({
  ...Object.fromEntries(
    Object.entries(addressFields).map(([key, schema]) => [
      key,
      schema.optional(),
    ])
  ),
  revision,
});

/** Address API fields and their columns. */
const ADDRESS_COLUMNS = {
  line1: 'line1',
  line2: 'line2',
  city: 'city',
  region: 'region',
  postalCode: 'postal_code',
  country: 'country',
  labelId: 'label_id',
  isPrimary: 'is_primary',
};

/**
 * Safe projection of an email or phone.
 * @param {object} row
 * @returns {object}
 */
export function contactMethodView(row) {
  return {
    id: row.id,
    partyId: row.party_id,
    type: row.type,
    value: row.value,
    labelId: row.label_id ?? null,
    isPrimary: row.is_primary,
    archived: row.deactivated_at != null,
    revision: row.revision,
  };
}

/**
 * Safe projection of an address.
 * @param {object} row
 * @returns {object}
 */
export function addressView(row) {
  return {
    id: row.id,
    partyId: row.party_id,
    line1: row.line1,
    line2: row.line2 ?? null,
    city: row.city,
    region: row.region ?? null,
    postalCode: row.postal_code ?? null,
    country: row.country,
    labelId: row.label_id ?? null,
    isPrimary: row.is_primary,
    archived: row.deactivated_at != null,
    revision: row.revision,
  };
}

/**
 * Parse an email or phone value for its type.
 * @param {'email'|'phone'} type
 * @param {string} value
 * @returns {string}
 */
function parseValue(type, value) {
  return parse(type === 'email' ? email : phone, value);
}

/**
 * Lock the party or report `NOT_FOUND`.
 * @param {object} context
 * @param {unknown} id
 * @param {object} tx
 * @returns {Promise<object>}
 */
async function lockParty(context, id, tx) {
  const party = await context.cell.parties.byKey(parseId(id), {
    tx,
    lock: true,
  });
  if (!party) throw new DirectoryError('NOT_FOUND');
  return party;
}

/**
 * Require an active label for `appliesTo`, or accept null.
 * @param {object} context
 * @param {string|null|undefined} id
 * @param {'email'|'phone'|'address'} appliesTo
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {DirectoryError} `INVALID_INPUT`
 */
async function requireLabel(context, id, appliesTo, tx) {
  if (id == null) return;
  const label = await context.cell.contact_labels.byKey(id, { tx });
  if (!label || label.deactivated_at || label.applies_to !== appliesTo)
    throw new DirectoryError('INVALID_INPUT');
}

/**
 * Clear the primary flag on the party's other active rows of one type.
 * @param {object} context
 * @param {'contact_methods'|'addresses'} table
 * @param {Record<string, unknown>} where
 * @param {string|null} keep Row that stays primary.
 * @param {object} tx
 * @returns {Promise<void>}
 */
async function demotePrimary(context, table, where, keep, tx) {
  for (const row of await context.cell[table].rows(
    { ...where, is_primary: true },
    { tx, lock: true }
  ))
    if (row.id !== keep)
      await context.cell[table].saveRevision(
        row.id,
        { is_primary: false },
        context.actorId,
        { tx }
      );
}

/**
 * An employee must keep an active primary email (R016).
 * @param {object} context
 * @param {object} party
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {DirectoryError} `INVALID_STATE`
 */
async function requirePrimaryEmail(context, party, tx) {
  if (party.kind !== 'employee') return;
  const rows = await context.cell.contact_methods.rows(
    { party_id: party.id, type: 'email', is_primary: true },
    { tx }
  );
  if (rows.length === 0) throw new DirectoryError('INVALID_STATE');
}

/**
 * A detail change for the outbox.
 * @param {string} eventKey
 * @param {object} party
 * @param {object|null} before
 * @param {object} after
 * @returns {import('./shared.js').DirectoryChange}
 */
function detailChange(eventKey, party, before, after) {
  const strip = view => {
    if (!view) return null;
    const rest = { ...view };
    delete rest.revision;
    return JSON.stringify(rest);
  };
  return {
    eventKey,
    recordId: after.id,
    details: {
      kind: party.kind,
      party_id: party.id,
      before: strip(before),
      after: strip(after),
    },
  };
}

/**
 * Add an email or phone to a party.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} partyId
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function addContactMethod(context, partyId, body) {
  const input = parse(methodCreate, body);
  const value = parseValue(input.type, input.value);
  return mutate(context, async tx => {
    const party = await lockParty(context, partyId, tx);
    await requireLabel(context, input.labelId, input.type, tx);
    if (input.isPrimary)
      await demotePrimary(
        context,
        'contact_methods',
        { party_id: party.id, type: input.type },
        null,
        tx
      );
    const row = await context.cell.contact_methods.insert(
      {
        tenant_id: context.tenant.id,
        party_id: party.id,
        type: input.type,
        value,
        label_id: input.labelId ?? null,
        is_primary: input.isPrimary ?? false,
        created_by: context.actorId,
        updated_by: context.actorId,
      },
      { tx }
    );
    const view = contactMethodView(row);
    return {
      result: view,
      changes: [
        detailChange('directory.contact_method.created', party, null, view),
      ],
    };
  });
}

/**
 * Lock a party's detail row or report `NOT_FOUND`.
 * @param {object} context
 * @param {'contact_methods'|'addresses'} table
 * @param {object} party
 * @param {unknown} id
 * @param {object} tx
 * @returns {Promise<object>}
 */
async function lockDetail(context, table, party, id, tx) {
  const row = await context.cell[table].byKey(parseId(id), { tx, lock: true });
  if (!row || row.party_id !== party.id || row.deactivated_at)
    throw new DirectoryError('NOT_FOUND');
  return row;
}

/**
 * Edit an email or phone. Clearing an employee's only primary email is
 * refused (R016).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} partyId
 * @param {unknown} methodId
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function updateContactMethod(context, partyId, methodId, body) {
  const input = parse(methodUpdate, body);
  return mutate(context, async tx => {
    const party = await lockParty(context, partyId, tx);
    const locked = await lockDetail(
      context,
      'contact_methods',
      party,
      methodId,
      tx
    );
    requireRevision(locked, input.revision);
    const changes = {};
    if (input.value !== undefined)
      changes.value = parseValue(locked.type, input.value);
    if (input.labelId !== undefined) {
      await requireLabel(context, input.labelId, locked.type, tx);
      changes.label_id = input.labelId;
    }
    if (input.isPrimary !== undefined) {
      if (input.isPrimary)
        await demotePrimary(
          context,
          'contact_methods',
          { party_id: party.id, type: locked.type },
          locked.id,
          tx
        );
      changes.is_primary = input.isPrimary;
    }
    const row = await context.cell.contact_methods.saveRevision(
      locked.id,
      changes,
      context.actorId,
      { tx }
    );
    await requirePrimaryEmail(context, party, tx);
    const view = contactMethodView(row);
    return {
      result: view,
      changes: [
        detailChange(
          'directory.contact_method.updated',
          party,
          contactMethodView(locked),
          view
        ),
      ],
    };
  });
}

/**
 * Remove (archive) an email or phone. Removing an employee's only primary
 * email is refused (R016).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} partyId
 * @param {unknown} methodId
 * @returns {Promise<object>}
 */
export function removeContactMethod(context, partyId, methodId) {
  return mutate(context, async tx => {
    const party = await lockParty(context, partyId, tx);
    const locked = await lockDetail(
      context,
      'contact_methods',
      party,
      methodId,
      tx
    );
    const row = await context.cell.contact_methods.saveRevision(
      locked.id,
      { archived: true },
      context.actorId,
      { tx }
    );
    await requirePrimaryEmail(context, party, tx);
    const view = contactMethodView(row);
    return {
      result: view,
      changes: [
        detailChange(
          'directory.contact_method.removed',
          party,
          contactMethodView(locked),
          view
        ),
      ],
    };
  });
}

/**
 * Add an address to a party. The country must be an M0004 country code.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} partyId
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function addAddress(context, partyId, body) {
  const input = parse(addressCreate, body);
  return mutate(context, async tx => {
    const party = await lockParty(context, partyId, tx);
    await requireLabel(context, input.labelId, 'address', tx);
    if (input.isPrimary)
      await demotePrimary(
        context,
        'addresses',
        { party_id: party.id },
        null,
        tx
      );
    const row = await context.cell.addresses.insert(
      {
        tenant_id: context.tenant.id,
        party_id: party.id,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city,
        region: input.region ?? null,
        postal_code: input.postalCode ?? null,
        country: input.country,
        label_id: input.labelId ?? null,
        is_primary: input.isPrimary ?? false,
        created_by: context.actorId,
        updated_by: context.actorId,
      },
      { tx }
    );
    const view = addressView(row);
    return {
      result: view,
      changes: [detailChange('directory.address.created', party, null, view)],
    };
  });
}

/**
 * Edit an address.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} partyId
 * @param {unknown} addressId
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export function updateAddress(context, partyId, addressId, body) {
  const input = parse(addressUpdate, body);
  return mutate(context, async tx => {
    const party = await lockParty(context, partyId, tx);
    const locked = await lockDetail(context, 'addresses', party, addressId, tx);
    requireRevision(locked, input.revision);
    if (input.labelId !== undefined)
      await requireLabel(context, input.labelId, 'address', tx);
    if (input.isPrimary)
      await demotePrimary(
        context,
        'addresses',
        { party_id: party.id },
        locked.id,
        tx
      );
    const changes = {};
    for (const [field, column] of Object.entries(ADDRESS_COLUMNS))
      if (input[field] !== undefined) changes[column] = input[field];
    const row = await context.cell.addresses.saveRevision(
      locked.id,
      changes,
      context.actorId,
      { tx }
    );
    const view = addressView(row);
    return {
      result: view,
      changes: [
        detailChange(
          'directory.address.updated',
          party,
          addressView(locked),
          view
        ),
      ],
    };
  });
}

/**
 * Remove (archive) an address.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} partyId
 * @param {unknown} addressId
 * @returns {Promise<object>}
 */
export function removeAddress(context, partyId, addressId) {
  return mutate(context, async tx => {
    const party = await lockParty(context, partyId, tx);
    const locked = await lockDetail(context, 'addresses', party, addressId, tx);
    const row = await context.cell.addresses.saveRevision(
      locked.id,
      { archived: true },
      context.actorId,
      { tx }
    );
    const view = addressView(row);
    return {
      result: view,
      changes: [
        detailChange(
          'directory.address.removed',
          party,
          addressView(locked),
          view
        ),
      ],
    };
  });
}
