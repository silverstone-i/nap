/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file People, organizations, and organization contacts (M0005-R001–R013).
 *
 * Every record is one `app.parties` row plus one child row of a matching
 * kind (R005). A tax ID only ever reaches the database through
 * `taxIds.protect` (R010), only with `tax-ids::write` (R012), and leaves it
 * masked unless revealed with `tax-ids::read`, which records who read it.
 */

import { z } from 'zod';
import { DirectoryError } from './errors.js';
import { addressView, contactMethodView } from './details.js';
import { endDesignations } from './tenantContacts.js';
import {
  containsPattern,
  mutate,
  parse,
  parseId,
  read,
  requireCapability,
  requireRevision,
  revision,
  revisionSchema,
  TAX_IDS_READ,
  TAX_IDS_WRITE,
  uuid,
} from './shared.js';

/** Record collections as the API names them, with their table and kinds. */
export const COLLECTIONS = Object.freeze({
  people: { table: 'people', kinds: ['employee', 'contact'] },
  organizations: { table: 'organizations', kinds: ['vendor', 'client'] },
  'organization-contacts': {
    table: 'organization_contacts',
    kinds: ['vendor_contact', 'client_contact'],
  },
});

/** Contact kind for each organization kind. */
const CONTACT_KIND = Object.freeze({
  vendor: 'vendor_contact',
  client: 'client_contact',
});

const personName = z.string().trim().min(1).max(160);
const longName = z.string().trim().min(1).max(255);
const taxId = z.string().max(32).nullable();
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

const personCreate = z.strictObject({
  kind: z.enum(COLLECTIONS.people.kinds),
  firstName: personName,
  lastName: personName,
  taxId: taxId.optional(),
  isPortalUser: z.boolean().optional(),
  primaryEmail: email.optional(),
});
const personUpdate = z.strictObject({
  firstName: personName.optional(),
  lastName: personName.optional(),
  taxId: taxId.optional(),
  isPortalUser: z.boolean().optional(),
  revision,
});
const contactFields = {
  fullName: longName,
  taxId: taxId.optional(),
  isPortalUser: z.boolean().optional(),
  isPrimaryTaxContact: z.boolean().optional(),
};
const organizationCreate = z.strictObject({
  kind: z.enum(COLLECTIONS.organizations.kinds),
  legalName: longName,
  dbaName: longName.nullable().optional(),
  taxId: taxId.optional(),
  contacts: z.array(z.strictObject(contactFields)).max(20).optional(),
});
const organizationUpdate = z.strictObject({
  legalName: longName.optional(),
  dbaName: longName.nullable().optional(),
  taxId: taxId.optional(),
  primaryTaxContactId: uuid.nullable().optional(),
  revision,
});
const contactCreate = z.strictObject({
  kind: z.enum(COLLECTIONS['organization-contacts'].kinds).optional(),
  organizationId: uuid,
  ...contactFields,
});
const contactUpdate = z.strictObject({
  fullName: longName.optional(),
  taxId: taxId.optional(),
  isPortalUser: z.boolean().optional(),
  revision,
});
const listQuery = z.object({
  kind: z.string().optional(),
  q: z.string().max(160).optional(),
  taxId: z.string().max(32).optional(),
  organizationId: uuid.optional(),
  includeArchived: z.enum(['true', 'false']).optional(),
});

/**
 * Look up a collection by its API name.
 * @param {string} name
 * @returns {{table: string, kinds: string[]}}
 * @throws {DirectoryError} `NOT_FOUND`
 */
function collection(name) {
  const found = Object.hasOwn(COLLECTIONS, name) ? COLLECTIONS[name] : null;
  if (!found) throw new DirectoryError('NOT_FOUND');
  return found;
}

/**
 * Primary email and phone of each party, keyed by party ID.
 * @param {object} context
 * @param {string[]} partyIds
 * @param {object} tx
 * @returns {Promise<Map<string, {email: string|null, phone: string|null}>>}
 */
async function primaries(context, partyIds, tx) {
  const map = new Map(partyIds.map(id => [id, { email: null, phone: null }]));
  for (const row of await context.cell.contact_methods.primariesFor(partyIds, {
    tx,
  }))
    map.get(row.party_id)[row.type] = row.value;
  return map;
}

/**
 * Safe projection of a record. A tax ID appears only as its last four
 * digits (R012).
 * @param {string} table
 * @param {object} row Child row joined with its party `kind`.
 * @param {{email: string|null, phone: string|null}} primary
 * @returns {object}
 */
export function recordView(table, row, primary = { email: null, phone: null }) {
  const common = {
    id: row.party_id,
    kind: row.kind,
    taxIdLast4: row.tax_id_last4 ?? null,
    archived: row.deactivated_at != null,
    revision: row.revision,
    primaryEmail: primary.email,
    primaryPhone: primary.phone,
  };
  if (table === 'people')
    return {
      ...common,
      firstName: row.first_name,
      lastName: row.last_name,
      isPortalUser: row.is_portal_user,
    };
  if (table === 'organizations')
    return {
      ...common,
      legalName: row.legal_name,
      dbaName: row.dba_name ?? null,
    };
  return {
    ...common,
    organizationId: row.organization_id,
    fullName: row.full_name,
    isPortalUser: row.is_portal_user,
    isPrimaryTaxContact: row.is_primary_tax_contact,
  };
}

/**
 * JSON snapshot for an event's `before` or `after`: the view without
 * volatile fields. It carries only the tax ID's last four digits (R025).
 * @param {object|null} view
 * @returns {string|null}
 */
function snapshot(view) {
  if (!view) return null;
  const rest = { ...view };
  delete rest.revision;
  delete rest.primaryEmail;
  delete rest.primaryPhone;
  return JSON.stringify(rest);
}

/**
 * A record change for the outbox.
 * @param {string} action `created`, `updated`, `archived`, or `restored`.
 * @param {string} table
 * @param {object|null} before View before the change.
 * @param {object} after View after the change.
 * @returns {import('./shared.js').DirectoryChange}
 */
function recordChange(action, table, before, after) {
  return {
    eventKey: `directory.record.${action}`,
    recordId: after.id,
    details: {
      kind: after.kind,
      record_table: table,
      before: snapshot(before),
      after: snapshot(after),
    },
  };
}

/**
 * Lock a record's child row, joined with its party kind, or report
 * `NOT_FOUND`.
 * @param {object} context
 * @param {string} table
 * @param {unknown} id
 * @param {object} tx
 * @returns {Promise<object>}
 * @throws {DirectoryError} `NOT_FOUND`
 */
async function lockRecord(context, table, id, tx) {
  const key = parseId(id);
  const row = await context.cell[table].byKey(key, { tx, lock: true });
  if (!row) throw new DirectoryError('NOT_FOUND');
  const party = await context.cell.parties.byKey(key, { tx });
  return { ...row, kind: party.kind };
}

/**
 * The view of a locked or freshly written row.
 * @param {object} context
 * @param {string} table
 * @param {object} row
 * @param {string} kind
 * @param {object} tx
 * @returns {Promise<object>}
 */
async function viewOf(context, table, row, kind, tx) {
  const map = await primaries(context, [row.party_id], tx);
  return recordView(table, { ...row, kind }, map.get(row.party_id));
}

/**
 * Protect a tax ID for storage, checking the write capability first.
 * @param {object} context
 * @param {string|null} value
 * @param {string} partyId
 * @returns {Promise<object>} The three tax ID columns.
 */
async function protectTaxId(context, value, partyId) {
  await requireCapability(context, TAX_IDS_WRITE);
  return context.taxIds.protect(value, {
    tenantId: context.tenant.id,
    partyId,
  });
}

/**
 * Other active records of the same table holding the same tax ID (R013).
 * @param {object} context
 * @param {string} table
 * @param {object} row
 * @param {object} tx
 * @returns {Promise<string[]>}
 */
function duplicates(context, table, row, tx) {
  if (!row.tax_id_hash) return [];
  return context.cell[table].holdersOfTaxId(row.tax_id_hash, row.party_id, {
    tx,
  });
}

/**
 * Insert a party and return its ID.
 * @param {object} context
 * @param {string} kind
 * @param {object} tx
 * @returns {Promise<string>}
 */
async function insertParty(context, kind, tx) {
  const row = await context.cell.parties.insert(
    {
      tenant_id: context.tenant.id,
      kind,
      created_by: context.actorId,
      updated_by: context.actorId,
    },
    { tx }
  );
  return row.id;
}

/**
 * Check a client's tax source (R007): exactly one of its own tax ID or an
 * active flagged contact. A vendor has a tax ID and no flagged contact (R006).
 * @param {object} context
 * @param {object} organization Organization row with `kind`.
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {DirectoryError} `INVALID_INPUT`
 */
async function requireTaxSource(context, organization, tx) {
  const flagged = await context.cell.organization_contacts.rows(
    { organization_id: organization.party_id, is_primary_tax_contact: true },
    { tx }
  );
  const own = organization.tax_id_hash != null;
  const valid =
    organization.kind === 'vendor'
      ? own && flagged.length === 0
      : own !== (flagged.length === 1);
  if (!valid) throw new DirectoryError('INVALID_INPUT');
}

/**
 * Insert one organization contact.
 * @param {object} context
 * @param {object} organization Organization row with `kind`.
 * @param {object} input Parsed contact fields.
 * @param {object} tx
 * @returns {Promise<object>} The contact row with `kind`.
 */
async function insertContact(context, organization, input, tx) {
  const kind = CONTACT_KIND[organization.kind];
  const hasTaxId = input.taxId !== undefined && input.taxId !== null;
  // R008: a vendor contact never has a tax ID; only a client contact can be
  // a primary tax contact (R007, R009).
  if (kind === 'vendor_contact' && (hasTaxId || input.isPrimaryTaxContact))
    throw new DirectoryError('INVALID_INPUT');
  const partyId = await insertParty(context, kind, tx);
  const protectedTaxId = hasTaxId
    ? await protectTaxId(context, input.taxId, partyId)
    : {};
  if (input.isPrimaryTaxContact)
    for (const row of await context.cell.organization_contacts.rows(
      { organization_id: organization.party_id, is_primary_tax_contact: true },
      { tx, lock: true }
    ))
      await context.cell.organization_contacts.saveRevision(
        row.party_id,
        { is_primary_tax_contact: false },
        context.actorId,
        { tx }
      );
  const row = await context.cell.organization_contacts.insert(
    {
      party_id: partyId,
      tenant_id: context.tenant.id,
      organization_id: organization.party_id,
      full_name: input.fullName,
      is_portal_user: input.isPortalUser ?? false,
      is_primary_tax_contact: input.isPrimaryTaxContact ?? false,
      ...protectedTaxId,
      created_by: context.actorId,
      updated_by: context.actorId,
    },
    { tx }
  );
  return { ...row, kind };
}

/**
 * List a collection, filtered by kind, name text, organization, or tax ID.
 * Searching by tax ID needs `tax-ids::read` (R013).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} name Collection name.
 * @param {object} query Raw query string values.
 * @returns {Promise<object[]>}
 */
export async function listRecords(context, name, query) {
  const { table, kinds } = collection(name);
  const input = parse(listQuery, query);
  const kindFilter = input.kind ? input.kind.split(',') : null;
  if (kindFilter && !kindFilter.every(kind => kinds.includes(kind)))
    throw new DirectoryError('INVALID_INPUT');
  let taxIdHash = null;
  if (input.taxId !== undefined) {
    await requireCapability(context, TAX_IDS_READ);
    taxIdHash = context.taxIds.hash(input.taxId);
  }
  return read(context, async tx => {
    const rows = await context.cell[table].search({
      tx,
      kinds: kindFilter ?? kinds,
      text: containsPattern(input.q),
      taxIdHash,
      includeArchived: input.includeArchived === 'true',
      ...(table === 'organization_contacts'
        ? { organizationId: input.organizationId ?? null }
        : {}),
    });
    const map = await primaries(
      context,
      rows.map(row => row.party_id),
      tx
    );
    return rows.map(row => recordView(table, row, map.get(row.party_id)));
  });
}

/**
 * One record with its emails, phones, and addresses; an organization adds
 * its contacts and an employee its tenant contact designations.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} name
 * @param {unknown} id
 * @returns {Promise<object>}
 */
export async function getRecord(context, name, id) {
  const { table } = collection(name);
  const key = parseId(id);
  return read(context, async tx => {
    const row = await context.cell[table].byKey(key, { tx });
    if (!row) throw new DirectoryError('NOT_FOUND');
    const party = await context.cell.parties.byKey(key, { tx });
    const view = await viewOf(context, table, row, party.kind, tx);
    const detail = {
      ...view,
      contactMethods: (
        await context.cell.contact_methods.rows(
          { party_id: key },
          { tx, orderBy: ['type', 'created_at', 'id'] }
        )
      ).map(contactMethodView),
      addresses: (
        await context.cell.addresses.rows(
          { party_id: key },
          { tx, orderBy: ['created_at', 'id'] }
        )
      ).map(addressView),
    };
    if (table === 'organizations') {
      const contacts = await context.cell.organization_contacts.search({
        tx,
        organizationId: key,
      });
      const map = await primaries(
        context,
        contacts.map(c => c.party_id),
        tx
      );
      detail.contacts = contacts.map(c =>
        recordView('organization_contacts', c, map.get(c.party_id))
      );
    }
    if (party.kind === 'employee')
      detail.designations = (
        await context.cell.tenant_contacts.rows({ party_id: key }, { tx })
      ).map(row => row.designation);
    return detail;
  });
}

/**
 * Create a record. An employee needs a primary email (R016); a client
 * without its own tax ID names its primary tax contact among `contacts`
 * (R007).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} name
 * @param {unknown} body
 * @returns {Promise<object>} The view, plus `duplicateTaxIds` when a tax ID was saved.
 */
export async function createRecord(context, name, body) {
  const { table } = collection(name);
  if (table === 'people') return createPerson(context, body);
  if (table === 'organizations') return createOrganization(context, body);
  return createContact(context, body);
}

async function createPerson(context, body) {
  const input = parse(personCreate, body);
  if (input.kind === 'employee' && !input.primaryEmail)
    throw new DirectoryError('INVALID_INPUT');
  return mutate(context, async tx => {
    const partyId = await insertParty(context, input.kind, tx);
    const protectedTaxId =
      input.taxId != null
        ? await protectTaxId(context, input.taxId, partyId)
        : {};
    const row = await context.cell.people.insert(
      {
        party_id: partyId,
        tenant_id: context.tenant.id,
        first_name: input.firstName,
        last_name: input.lastName,
        is_portal_user: input.isPortalUser ?? false,
        ...protectedTaxId,
        created_by: context.actorId,
        updated_by: context.actorId,
      },
      { tx }
    );
    if (input.primaryEmail)
      await context.cell.contact_methods.insert(
        {
          tenant_id: context.tenant.id,
          party_id: partyId,
          type: 'email',
          value: input.primaryEmail,
          is_primary: true,
          created_by: context.actorId,
          updated_by: context.actorId,
        },
        { tx }
      );
    const view = await viewOf(context, 'people', row, input.kind, tx);
    return {
      result: withDuplicates(
        view,
        input.taxId != null,
        await duplicates(context, 'people', row, tx)
      ),
      changes: [recordChange('created', 'people', null, view)],
    };
  });
}

async function createOrganization(context, body) {
  const input = parse(organizationCreate, body);
  if (input.kind === 'vendor' && input.contacts?.length)
    throw new DirectoryError('INVALID_INPUT');
  return mutate(context, async tx => {
    const partyId = await insertParty(context, input.kind, tx);
    const protectedTaxId =
      input.taxId != null
        ? await protectTaxId(context, input.taxId, partyId)
        : {};
    const row = await context.cell.organizations.insert(
      {
        party_id: partyId,
        tenant_id: context.tenant.id,
        legal_name: input.legalName,
        dba_name: input.dbaName ?? null,
        ...protectedTaxId,
        created_by: context.actorId,
        updated_by: context.actorId,
      },
      { tx }
    );
    const organization = { ...row, kind: input.kind };
    const changes = [];
    for (const contact of input.contacts ?? []) {
      const created = await insertContact(context, organization, contact, tx);
      changes.push(
        recordChange(
          'created',
          'organization_contacts',
          null,
          recordView('organization_contacts', created)
        )
      );
    }
    await requireTaxSource(context, organization, tx);
    const view = await viewOf(context, 'organizations', row, input.kind, tx);
    return {
      result: withDuplicates(
        view,
        input.taxId != null,
        await duplicates(context, 'organizations', row, tx)
      ),
      changes: [
        recordChange('created', 'organizations', null, view),
        ...changes,
      ],
    };
  });
}

async function createContact(context, body) {
  const input = parse(contactCreate, body);
  return mutate(context, async tx => {
    const organization = await lockRecord(
      context,
      'organizations',
      input.organizationId,
      tx
    );
    if (organization.deactivated_at) throw new DirectoryError('NOT_FOUND');
    if (input.kind && input.kind !== CONTACT_KIND[organization.kind])
      throw new DirectoryError('INVALID_INPUT');
    const row = await insertContact(context, organization, input, tx);
    if (input.isPrimaryTaxContact)
      await requireTaxSource(context, organization, tx);
    const view = await viewOf(
      context,
      'organization_contacts',
      row,
      row.kind,
      tx
    );
    return {
      result: withDuplicates(
        view,
        input.taxId != null,
        await duplicates(context, 'organization_contacts', row, tx)
      ),
      changes: [recordChange('created', 'organization_contacts', null, view)],
    };
  });
}

/**
 * Add `duplicateTaxIds` to a response when the request saved a tax ID.
 * @param {object} view
 * @param {boolean} savedTaxId
 * @param {string[]} holders
 * @returns {object}
 */
function withDuplicates(view, savedTaxId, holders) {
  return savedTaxId ? { ...view, duplicateTaxIds: holders } : view;
}

/**
 * Edit a record with optimistic concurrency. Setting or clearing a tax ID
 * needs `tax-ids::write` (R012). An organization edit may move a client's
 * tax source between its own tax ID and a flagged contact (R007).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} name
 * @param {unknown} id
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export async function updateRecord(context, name, id, body) {
  const { table } = collection(name);
  const schema =
    table === 'people'
      ? personUpdate
      : table === 'organizations'
        ? organizationUpdate
        : contactUpdate;
  const input = parse(schema, body);
  return mutate(context, async tx => {
    const locked = await lockRecord(context, table, id, tx);
    requireRevision(locked, input.revision);
    const before = await viewOf(context, table, locked, locked.kind, tx);
    const changes = {};
    const map = {
      firstName: 'first_name',
      lastName: 'last_name',
      isPortalUser: 'is_portal_user',
      legalName: 'legal_name',
      dbaName: 'dba_name',
      fullName: 'full_name',
    };
    for (const [field, column] of Object.entries(map))
      if (input[field] !== undefined) changes[column] = input[field];
    if (input.taxId !== undefined) {
      if (locked.kind === 'vendor_contact' && input.taxId !== null)
        throw new DirectoryError('INVALID_INPUT');
      if (input.taxId === null && locked.is_primary_tax_contact)
        throw new DirectoryError('PRIMARY_TAX_CONTACT');
      Object.assign(
        changes,
        await protectTaxId(context, input.taxId, locked.party_id)
      );
    }
    const extra = [];
    if (table === 'organizations' && input.primaryTaxContactId !== undefined) {
      if (locked.kind !== 'client') throw new DirectoryError('INVALID_INPUT');
      extra.push(
        ...(await setPrimaryTaxContact(
          context,
          locked,
          input.primaryTaxContactId,
          tx
        ))
      );
    }
    const row = await context.cell[table].saveRevision(
      locked.party_id,
      changes,
      context.actorId,
      { tx }
    );
    if (table === 'organizations')
      await requireTaxSource(context, { ...row, kind: locked.kind }, tx);
    const after = await viewOf(context, table, row, locked.kind, tx);
    return {
      result: withDuplicates(
        after,
        input.taxId != null,
        await duplicates(context, table, row, tx)
      ),
      changes: [recordChange('updated', table, before, after), ...extra],
    };
  });
}

/**
 * Flag `contactId` as the client's primary tax contact, or clear the flag
 * with null. The contact must be an active contact of this client with a
 * tax ID (R009).
 * @param {object} context
 * @param {object} organization Locked client row.
 * @param {string|null} contactId
 * @param {object} tx
 * @returns {Promise<import('./shared.js').DirectoryChange[]>}
 */
async function setPrimaryTaxContact(context, organization, contactId, tx) {
  const contacts = context.cell.organization_contacts;
  const changes = [];
  const flip = async (row, value) => {
    const before = recordView('organization_contacts', {
      ...row,
      kind: 'client_contact',
    });
    const saved = await contacts.saveRevision(
      row.party_id,
      { is_primary_tax_contact: value },
      context.actorId,
      { tx }
    );
    changes.push(
      recordChange(
        'updated',
        'organization_contacts',
        before,
        recordView('organization_contacts', {
          ...saved,
          kind: 'client_contact',
        })
      )
    );
  };
  let target = null;
  if (contactId) {
    target = await contacts.byKey(contactId, { tx, lock: true });
    if (
      !target ||
      target.organization_id !== organization.party_id ||
      target.deactivated_at ||
      !target.tax_id_hash
    )
      throw new DirectoryError('INVALID_INPUT');
  }
  for (const row of await contacts.rows(
    { organization_id: organization.party_id, is_primary_tax_contact: true },
    { tx, lock: true }
  ))
    if (row.party_id !== contactId) await flip(row, false);
  if (target && !target.is_primary_tax_contact) await flip(target, true);
  return changes;
}

/**
 * Archive a record (R015 lifecycle). A client's primary tax contact cannot
 * be archived (R009). An employee's tenant contact designations end with
 * it, and archiving the last primary tenant contact is refused (R019).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} name
 * @param {unknown} id
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export async function archiveRecord(context, name, id, body) {
  const { table } = collection(name);
  const input = parse(revisionSchema, body);
  return mutate(context, async tx => {
    const locked = await lockRecord(context, table, id, tx);
    requireRevision(locked, input.revision);
    if (locked.is_primary_tax_contact && !locked.deactivated_at)
      throw new DirectoryError('PRIMARY_TAX_CONTACT');
    const changes = [];
    if (locked.kind === 'employee') {
      changes.push(...(await endDesignations(context, locked.party_id, tx)));
    }
    const before = await viewOf(context, table, locked, locked.kind, tx);
    const row = await context.cell[table].saveRevision(
      locked.party_id,
      { archived: true },
      context.actorId,
      { tx }
    );
    const after = await viewOf(context, table, row, locked.kind, tx);
    return {
      result: after,
      changes: [recordChange('archived', table, before, after), ...changes],
    };
  });
}

/**
 * Restore an archived record. Tenant contact designations do not come back.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} name
 * @param {unknown} id
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export async function restoreRecord(context, name, id, body) {
  const { table } = collection(name);
  const input = parse(revisionSchema, body);
  return mutate(context, async tx => {
    const locked = await lockRecord(context, table, id, tx);
    requireRevision(locked, input.revision);
    const before = await viewOf(context, table, locked, locked.kind, tx);
    const row = await context.cell[table].saveRevision(
      locked.party_id,
      { archived: false },
      context.actorId,
      { tx }
    );
    const after = await viewOf(context, table, row, locked.kind, tx);
    return {
      result: after,
      changes: [recordChange('restored', table, before, after)],
    };
  });
}

/**
 * Reveal a record's full tax ID and record who read it (R012). The route
 * requires `tax-ids::read`.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} name
 * @param {unknown} id
 * @returns {Promise<{taxId: string}>}
 */
export async function revealTaxId(context, name, id) {
  const { table } = collection(name);
  const key = parseId(id);
  return mutate(context, async tx => {
    const row = await context.cell[table].byKey(key, { tx });
    if (!row?.tax_id_encrypted) throw new DirectoryError('NOT_FOUND');
    const party = await context.cell.parties.byKey(key, { tx });
    const value = context.taxIds.reveal(row.tax_id_encrypted, {
      tenantId: context.tenant.id,
      partyId: key,
    });
    return {
      result: { taxId: value },
      changes: [
        {
          eventKey: 'directory.tax_id.revealed',
          recordId: key,
          details: { kind: party.kind, record_table: table },
        },
      ],
    };
  });
}
