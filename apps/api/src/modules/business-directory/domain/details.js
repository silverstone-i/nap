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

import { normalizePhone } from '@nap/shared';
import { z } from 'zod';
import { effectiveSettings } from '../../tenant-settings/domain/general.js';
import { DirectoryError } from './errors.js';
import {
  DIRECTORY_READ,
  mutate,
  parse,
  parseId,
  read,
  requireCapability,
  requireRevision,
  revision,
  uuid,
} from './shared.js';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
/**
 * R033, R046: stored in E.164 form; input without `+` is a number of the
 * tenant's default country.
 * @param {string} country
 */
const phone = country =>
  z
    .string()
    .transform(value => normalizePhone(value, country))
    .pipe(z.string());
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
/**
 * R063: address text is saved trimmed with each run of whitespace reduced to
 * one space, so the match index need only ignore case.
 * @param {number} max
 */
const text = max =>
  z
    .string()
    .transform(value => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1).max(max));
const line = text(255);
const addressFields = {
  line1: line,
  line2: line.nullable(),
  city: text(120),
  region: text(120).nullable(),
  postalCode: text(32).nullable(),
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

const matchBody = z.discriminatedUnion('type', [
  z.strictObject({ type: z.enum(['email', 'phone']), value: z.string() }),
  addressCreate
    .omit({ labelId: true, isPrimary: true })
    .extend({ type: z.literal('address') }),
]);
/** R066: the most matches a lookup returns. */
const MATCH_LIMIT = 20;

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
 * Parse an email or phone value for its type. A phone is read in the
 * tenant's effective default country (M0005-R046), inside `tx`.
 * @param {object} context
 * @param {'email'|'phone'} type
 * @param {string} value
 * @param {object} tx
 * @returns {Promise<string>}
 */
async function parseValue(context, type, value, tx) {
  if (type === 'email') return parse(email, value);
  const { defaultCountry } = await effectiveSettings(
    context.cell,
    context.tenant.id,
    tx
  );
  return parse(phone(defaultCountry), value);
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
 * Snapshot a portal user's primary email, and return a check that refuses
 * the change when it moved (I0008-R018): the login keeps the email it was
 * created with, so access must be off first.
 * @param {object} context
 * @param {object} party
 * @param {object} tx
 * @returns {Promise<() => Promise<void>>}
 */
async function lockPortalEmail(context, party, tx) {
  const primary = async () => {
    const [row] = await context.cell.contact_methods.rows(
      { party_id: party.id, type: 'email', is_primary: true },
      { tx }
    );
    return row ? `${row.id}:${row.value}` : null;
  };
  const person = await context.cell.people.byKey(party.id, { tx });
  if (!person?.is_portal_user) return async () => {};
  const before = await primary();
  return async () => {
    if ((await primary()) !== before) throw new DirectoryError('INVALID_STATE');
  };
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
  return mutate(context, async tx => {
    const value = await parseValue(context, input.type, input.value, tx);
    const party = await lockParty(context, partyId, tx);
    const portalEmail = await lockPortalEmail(context, party, tx);
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
    await portalEmail();
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
    const portalEmail = await lockPortalEmail(context, party, tx);
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
      changes.value = await parseValue(context, locked.type, input.value, tx);
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
    await portalEmail();
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
    const portalEmail = await lockPortalEmail(context, party, tx);
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
    await portalEmail();
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

/**
 * Other records holding an email, phone, or address matching `body`,
 * normalized as a save would (M0005-R065, R066). Archived records are
 * included; the requesting party is not.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} partyId
 * @param {unknown} body
 * @returns {Promise<{matches: object[]}>}
 * @throws {DirectoryError} `FORBIDDEN`, `INVALID_INPUT`, `NOT_FOUND`
 */
export async function findMatches(context, partyId, body) {
  // R066: the route takes write; names of other records also need read.
  await requireCapability(context, DIRECTORY_READ);
  const input = parse(matchBody, body);
  const id = parseId(partyId);
  return read(context, async tx => {
    if (!(await context.cell.parties.byKey(id, { tx })))
      throw new DirectoryError('NOT_FOUND');
    const ids =
      input.type === 'address'
        ? await context.cell.addresses.partiesWithAddress(
            {
              address: {
                line1: input.line1,
                line2: input.line2 ?? null,
                city: input.city,
                region: input.region ?? null,
                postal_code: input.postalCode ?? null,
                country: input.country,
              },
              excludePartyId: id,
            },
            { tx }
          )
        : await context.cell.contact_methods.partiesWithValue(
            {
              type: input.type,
              value: await parseValue(context, input.type, input.value, tx),
              excludePartyId: id,
            },
            { tx }
          );
    const rows = await context.cell.parties.summaries(ids, MATCH_LIMIT, {
      tx,
    });
    return {
      matches: rows.map(row => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        archived: row.archived,
        organization: row.organization_id
          ? {
              id: row.organization_id,
              name: row.organization_name,
              archived: row.organization_archived,
            }
          : null,
      })),
    };
  });
}
