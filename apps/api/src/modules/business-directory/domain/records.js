/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file People, organizations, and organization contacts (M0005-R001–R013).
 *
 * Every record is one `app.parties` row plus one child row of a matching
 * kind (R005): people and organization contacts in `app.people`, vendors and
 * clients in `app.organizations`. A record's tax ID lives on its party. It
 * only ever reaches the database through `taxIds.protect` (R010), only with
 * `tax-ids::write` (R012), and leaves it masked unless revealed with
 * `tax-ids::read`, which records who read it.
 */

import { z } from 'zod';
import { DirectoryError } from './errors.js';
import {
  assertCanTurnOff,
  PORTAL_OFF,
  portalFacts,
  portalStatus,
  sendPortalAccess,
  temporaryPassword,
} from './portalAccess.js';
import { addressView, contactMethodView } from './details.js';
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
    table: 'people',
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

/** Tax ID columns, which live on the party (R010). */
const TAX_COLUMNS = ['tax_id_encrypted', 'tax_id_hash', 'tax_id_last4'];
const taxId = z.string().max(32).nullable();
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

const personCreate = z.strictObject({
  kind: z.enum(COLLECTIONS.people.kinds),
  firstName: personName,
  lastName: personName,
  taxId: taxId.optional(),
  isPortalUser: z.boolean().optional(),
  temporaryPassword: temporaryPassword.optional(),
  primaryEmail: email.optional(),
});
const personUpdate = z.strictObject({
  firstName: personName.optional(),
  lastName: personName.optional(),
  taxId: taxId.optional(),
  isPortalUser: z.boolean().optional(),
  temporaryPassword: temporaryPassword.optional(),
  revision,
});
const contactFields = {
  firstName: personName,
  lastName: personName,
  taxId: taxId.optional(),
  isPortalUser: z.boolean().optional(),
  isPrimaryContact: z.boolean().optional(),
  isBillingContact: z.boolean().optional(),
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
  firstName: personName.optional(),
  lastName: personName.optional(),
  taxId: taxId.optional(),
  isPortalUser: z.boolean().optional(),
  temporaryPassword: temporaryPassword.optional(),
  isPrimaryContact: z.boolean().optional(),
  isBillingContact: z.boolean().optional(),
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
 * A child row joined with its party's `kind` and tax ID columns.
 * @param {object} row
 * @param {object} party
 * @returns {object}
 */
function withParty(row, party) {
  const joined = { ...row, kind: party.kind };
  for (const column of TAX_COLUMNS) joined[column] = party[column];
  return joined;
}

/**
 * Load a record of one collection, joined with its party, or report
 * `NOT_FOUND`. A key of another collection's kind is not found here, since
 * `app.people` holds more than one collection.
 * @param {object} context
 * @param {string} name Collection name.
 * @param {unknown} id
 * @param {object} tx
 * @param {{lock?: boolean}} [options] `lock` locks the child row.
 * @returns {Promise<object>}
 * @throws {DirectoryError} `NOT_FOUND`
 */
async function loadRecord(context, name, id, tx, { lock = false } = {}) {
  const { table, kinds } = collection(name);
  const key = parseId(id);
  const row = await context.cell[table].byKey(key, { tx, lock });
  if (!row) throw new DirectoryError('NOT_FOUND');
  const party = await context.cell.parties.byKey(key, { tx });
  if (!kinds.includes(party.kind)) throw new DirectoryError('NOT_FOUND');
  return withParty(row, party);
}

/**
 * Primary email and phone of each party, and the facts its portal-access
 * status comes from (I0008-R008), keyed by party ID.
 * @param {object} context
 * @param {string[]} partyIds
 * @param {object} tx
 * @returns {Promise<Map<string, {email: string|null, phone: string|null, portal?: object}>>}
 */
async function primaries(context, partyIds, tx) {
  const map = new Map(partyIds.map(id => [id, { email: null, phone: null }]));
  for (const row of await context.cell.contact_methods.primariesFor(partyIds, {
    tx,
  }))
    map.get(row.party_id)[row.type] = row.value;
  for (const [id, fact] of await portalFacts(context, partyIds, tx))
    map.get(id).portal = fact;
  return map;
}

/**
 * Safe projection of a record. A tax ID appears only as its last four
 * digits (R012).
 * @param {string} name Collection name.
 * @param {object} row Child row joined with its party (`withParty`).
 * @param {{email: string|null, phone: string|null}} primary
 * @returns {object}
 */
export function recordView(name, row, primary = { email: null, phone: null }) {
  const portalAccess = primary.portal
    ? portalStatus(row.is_portal_user, primary.portal)
    : PORTAL_OFF;
  const common = {
    id: row.party_id,
    kind: row.kind,
    taxIdLast4: row.tax_id_last4 ?? null,
    archived: row.deactivated_at != null,
    revision: row.revision,
    primaryEmail: primary.email,
    primaryPhone: primary.phone,
  };
  if (name === 'people')
    return {
      ...common,
      firstName: row.first_name,
      lastName: row.last_name,
      isPortalUser: row.is_portal_user,
      portalAccess,
    };
  if (name === 'organizations')
    return {
      ...common,
      legalName: row.legal_name,
      dbaName: row.dba_name ?? null,
    };
  return {
    ...common,
    organizationId: row.organization_id,
    firstName: row.first_name,
    lastName: row.last_name,
    isPortalUser: row.is_portal_user,
    portalAccess,
    isPrimaryContact: row.is_primary_contact,
    isBillingContact: row.is_billing_contact,
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
  delete rest.portalAccess;
  return JSON.stringify(rest);
}

/**
 * A record change for the outbox.
 * @param {string} action `created`, `updated`, `archived`, or `restored`.
 * @param {string} name Collection name.
 * @param {object|null} before View before the change.
 * @param {object} after View after the change.
 * @returns {import('./shared.js').DirectoryChange}
 */
function recordChange(action, name, before, after) {
  return {
    eventKey: `directory.record.${action}`,
    recordId: after.id,
    details: {
      kind: after.kind,
      record_table: COLLECTIONS[name].table,
      before: snapshot(before),
      after: snapshot(after),
    },
  };
}

/**
 * The view of a loaded or freshly written row joined with its party.
 * @param {object} context
 * @param {string} name Collection name.
 * @param {object} row
 * @param {object} tx
 * @returns {Promise<object>}
 */
async function viewOf(context, name, row, tx) {
  const map = await primaries(context, [row.party_id], tx);
  return recordView(name, row, map.get(row.party_id));
}

/**
 * Save a record's tax ID on its party, checking the write capability first.
 * @param {object} context
 * @param {string|null} value Entered tax ID, or null to clear it.
 * @param {string} partyId
 * @param {object} tx
 * @returns {Promise<object>} The three tax ID columns as stored.
 */
async function saveTaxId(context, value, partyId, tx) {
  await requireCapability(context, TAX_IDS_WRITE);
  const columns = context.taxIds.protect(value, {
    tenantId: context.tenant.id,
    partyId,
  });
  await context.cell.parties.setTaxId(partyId, columns, context.actorId, {
    tx,
  });
  return columns;
}

/**
 * Other active records holding the same tax ID (R013).
 * @param {object} context
 * @param {object} row Row joined with its party.
 * @param {object} tx
 * @returns {Promise<string[]>}
 */
function duplicates(context, row, tx) {
  if (!row.tax_id_hash) return [];
  return context.cell.parties.holdersOfTaxId(row.tax_id_hash, row.party_id, {
    tx,
  });
}

/**
 * Insert a party and, when `taxIdValue` is given, its tax ID.
 * @param {object} context
 * @param {string} kind
 * @param {string|null|undefined} taxIdValue
 * @param {object} tx
 * @returns {Promise<object>} The party as stored.
 */
async function insertParty(context, kind, taxIdValue, tx) {
  const party = await context.cell.parties.insert(
    {
      tenant_id: context.tenant.id,
      kind,
      created_by: context.actorId,
      updated_by: context.actorId,
    },
    { tx }
  );
  if (taxIdValue == null) return party;
  return {
    ...party,
    ...(await saveTaxId(context, taxIdValue, party.id, tx)),
  };
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
  const flagged = await context.cell.people.rows(
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
  // R009: the flagged contact must have a tax ID.
  if (input.isPrimaryTaxContact && !hasTaxId)
    throw new DirectoryError('INVALID_INPUT');
  // I0008-R003: a contact is created without an email, so its portal
  // access can only be turned on by editing it once it has one.
  if (input.isPortalUser) throw new DirectoryError('INVALID_INPUT');
  const party = await insertParty(context, kind, input.taxId, tx);
  if (input.isPrimaryTaxContact)
    for (const row of await context.cell.people.rows(
      { organization_id: organization.party_id, is_primary_tax_contact: true },
      { tx, lock: true }
    ))
      await context.cell.people.saveRevision(
        row.party_id,
        { is_primary_tax_contact: false },
        context.actorId,
        { tx }
      );
  const row = await context.cell.people.insert(
    {
      party_id: party.id,
      tenant_id: context.tenant.id,
      organization_id: organization.party_id,
      first_name: input.firstName,
      last_name: input.lastName,
      is_portal_user: false,
      is_primary_contact: input.isPrimaryContact ?? false,
      is_billing_contact: input.isBillingContact ?? false,
      is_primary_tax_contact: input.isPrimaryTaxContact ?? false,
      created_by: context.actorId,
      updated_by: context.actorId,
    },
    { tx }
  );
  return withParty(row, party);
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
      ...(name === 'organization-contacts'
        ? { organizationId: input.organizationId ?? null }
        : {}),
    });
    const map = await primaries(
      context,
      rows.map(row => row.party_id),
      tx
    );
    return rows.map(row => recordView(name, row, map.get(row.party_id)));
  });
}

/**
 * One record with its emails, phones, and addresses; an organization adds
 * its contacts.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} name
 * @param {unknown} id
 * @returns {Promise<object>}
 */
export async function getRecord(context, name, id) {
  return read(context, async tx => {
    const row = await loadRecord(context, name, id, tx);
    const key = row.party_id;
    const view = await viewOf(context, name, row, tx);
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
    if (name === 'organizations') {
      const contacts = await context.cell.people.search({
        tx,
        kinds: COLLECTIONS['organization-contacts'].kinds,
        organizationId: key,
      });
      const map = await primaries(
        context,
        contacts.map(c => c.party_id),
        tx
      );
      detail.contacts = contacts.map(c =>
        recordView('organization-contacts', c, map.get(c.party_id))
      );
    }
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
  collection(name);
  if (name === 'people') return createPerson(context, body);
  if (name === 'organizations') return createOrganization(context, body);
  return createContact(context, body);
}

async function createPerson(context, body) {
  const input = parse(personCreate, body);
  if (input.kind === 'employee' && !input.primaryEmail)
    throw new DirectoryError('INVALID_INPUT');
  return mutate(context, async tx => {
    const party = await insertParty(context, input.kind, input.taxId, tx);
    const partyId = party.id;
    const row = withParty(
      await context.cell.people.insert(
        {
          party_id: partyId,
          tenant_id: context.tenant.id,
          first_name: input.firstName,
          last_name: input.lastName,
          is_portal_user: input.isPortalUser ?? false,
          created_by: context.actorId,
          updated_by: context.actorId,
        },
        { tx }
      ),
      party
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
    if (row.is_portal_user)
      await sendPortalAccess(context, row, true, input.temporaryPassword, tx);
    const view = await viewOf(context, 'people', row, tx);
    return {
      result: withDuplicates(
        view,
        input.taxId != null,
        await duplicates(context, row, tx)
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
    const party = await insertParty(context, input.kind, input.taxId, tx);
    const organization = withParty(
      await context.cell.organizations.insert(
        {
          party_id: party.id,
          tenant_id: context.tenant.id,
          legal_name: input.legalName,
          dba_name: input.dbaName ?? null,
          created_by: context.actorId,
          updated_by: context.actorId,
        },
        { tx }
      ),
      party
    );
    const changes = [];
    for (const contact of input.contacts ?? []) {
      const created = await insertContact(context, organization, contact, tx);
      changes.push(
        recordChange(
          'created',
          'organization-contacts',
          null,
          recordView('organization-contacts', created)
        )
      );
    }
    await requireTaxSource(context, organization, tx);
    const view = await viewOf(context, 'organizations', organization, tx);
    return {
      result: withDuplicates(
        view,
        input.taxId != null,
        await duplicates(context, organization, tx)
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
    const organization = await loadRecord(
      context,
      'organizations',
      input.organizationId,
      tx,
      { lock: true }
    );
    if (organization.deactivated_at) throw new DirectoryError('NOT_FOUND');
    if (input.kind && input.kind !== CONTACT_KIND[organization.kind])
      throw new DirectoryError('INVALID_INPUT');
    const row = await insertContact(context, organization, input, tx);
    if (input.isPrimaryTaxContact)
      await requireTaxSource(context, organization, tx);
    const view = await viewOf(context, 'organization-contacts', row, tx);
    return {
      result: withDuplicates(
        view,
        input.taxId != null,
        await duplicates(context, row, tx)
      ),
      changes: [recordChange('created', 'organization-contacts', null, view)],
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
    name === 'people'
      ? personUpdate
      : name === 'organizations'
        ? organizationUpdate
        : contactUpdate;
  const input = parse(schema, body);
  return mutate(context, async tx => {
    const locked = await loadRecord(context, name, id, tx, { lock: true });
    requireRevision(locked, input.revision);
    const before = await viewOf(context, name, locked, tx);
    const changes = {};
    const map = {
      firstName: 'first_name',
      lastName: 'last_name',
      isPortalUser: 'is_portal_user',
      isPrimaryContact: 'is_primary_contact',
      isBillingContact: 'is_billing_contact',
      legalName: 'legal_name',
      dbaName: 'dba_name',
    };
    for (const [field, column] of Object.entries(map))
      if (input[field] !== undefined) changes[column] = input[field];
    let taxColumns = {};
    if (input.taxId !== undefined) {
      if (locked.kind === 'vendor_contact' && input.taxId !== null)
        throw new DirectoryError('INVALID_INPUT');
      if (input.taxId === null && locked.is_primary_tax_contact)
        throw new DirectoryError('PRIMARY_TAX_CONTACT');
      taxColumns = await saveTaxId(context, input.taxId, locked.party_id, tx);
    }
    const extra = [];
    if (name === 'organizations' && input.primaryTaxContactId !== undefined) {
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
    // I0008-R001–R006: a flag change sends a request; anything else
    // ignores `temporaryPassword` (R004).
    const portal =
      input.isPortalUser !== undefined &&
      input.isPortalUser !== locked.is_portal_user
        ? input.isPortalUser
        : null;
    if (portal === true && locked.deactivated_at)
      throw new DirectoryError('INVALID_STATE');
    if (portal === false) await assertCanTurnOff(context, locked, tx);
    const row = {
      ...withParty(
        await context.cell[table].saveRevision(
          locked.party_id,
          changes,
          context.actorId,
          { tx }
        ),
        locked
      ),
      ...taxColumns,
    };
    if (portal !== null)
      await sendPortalAccess(context, row, portal, input.temporaryPassword, tx);
    if (name === 'organizations') await requireTaxSource(context, row, tx);
    const after = await viewOf(context, name, row, tx);
    return {
      result: withDuplicates(
        after,
        input.taxId != null,
        await duplicates(context, row, tx)
      ),
      changes: [recordChange('updated', name, before, after), ...extra],
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
  const contacts = context.cell.people;
  const changes = [];
  const joined = async row =>
    withParty(row, await context.cell.parties.byKey(row.party_id, { tx }));
  const flip = async (row, value) => {
    const party = await joined(row);
    const before = recordView('organization-contacts', party);
    const saved = await contacts.saveRevision(
      row.party_id,
      { is_primary_tax_contact: value },
      context.actorId,
      { tx }
    );
    changes.push(
      recordChange(
        'updated',
        'organization-contacts',
        before,
        recordView('organization-contacts', withParty(saved, party))
      )
    );
  };
  let target = null;
  if (contactId) {
    const row = await contacts.byKey(contactId, { tx, lock: true });
    target = row ? await joined(row) : null;
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
 * be archived (R009).
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
    const locked = await loadRecord(context, name, id, tx, { lock: true });
    requireRevision(locked, input.revision);
    if (locked.is_primary_tax_contact && !locked.deactivated_at)
      throw new DirectoryError('PRIMARY_TAX_CONTACT');
    // I0008-R002: archiving a person turns their access off.
    const portalOff = table === 'people' && locked.is_portal_user;
    if (portalOff) await assertCanTurnOff(context, locked, tx);
    const before = await viewOf(context, name, locked, tx);
    const row = withParty(
      await context.cell[table].saveRevision(
        locked.party_id,
        portalOff
          ? { archived: true, is_portal_user: false }
          : { archived: true },
        context.actorId,
        { tx }
      ),
      locked
    );
    if (portalOff) await sendPortalAccess(context, row, false, undefined, tx);
    const after = await viewOf(context, name, row, tx);
    return {
      result: after,
      changes: [recordChange('archived', name, before, after)],
    };
  });
}

/**
 * Restore an archived record.
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
    const locked = await loadRecord(context, name, id, tx, { lock: true });
    requireRevision(locked, input.revision);
    const before = await viewOf(context, name, locked, tx);
    const row = withParty(
      await context.cell[table].saveRevision(
        locked.party_id,
        { archived: false },
        context.actorId,
        { tx }
      ),
      locked
    );
    const after = await viewOf(context, name, row, tx);
    return {
      result: after,
      changes: [recordChange('restored', name, before, after)],
    };
  });
}

const retryBody = z.strictObject({
  temporaryPassword: temporaryPassword.optional(),
});

/**
 * Resend a person's failed portal-access request to match the current flag
 * (I0008-R007). Turning access on again needs a new temporary password.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} name `people` or `organization-contacts`.
 * @param {unknown} id
 * @param {unknown} body `{temporaryPassword?}`
 * @returns {Promise<object>} The person's view.
 * @throws {DirectoryError} `NOT_FOUND`, `INVALID_INPUT`, `INVALID_STATE`
 */
export async function retryPortalAccess(context, name, id, body) {
  if (collection(name).table !== 'people')
    throw new DirectoryError('NOT_FOUND');
  const input = parse(retryBody, body ?? {});
  return mutate(context, async tx => {
    const person = await loadRecord(context, name, id, tx, { lock: true });
    const before = await viewOf(context, name, person, tx);
    if (before.portalAccess.status !== 'failed')
      throw new DirectoryError('INVALID_STATE');
    if (!person.is_portal_user) await assertCanTurnOff(context, person, tx);
    await sendPortalAccess(
      context,
      person,
      person.is_portal_user,
      person.is_portal_user ? input.temporaryPassword : undefined,
      tx
    );
    return { result: await viewOf(context, name, person, tx) };
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
  return mutate(context, async tx => {
    const row = await loadRecord(context, name, id, tx);
    if (!row.tax_id_encrypted) throw new DirectoryError('NOT_FOUND');
    const value = context.taxIds.reveal(row.tax_id_encrypted, {
      tenantId: context.tenant.id,
      partyId: row.party_id,
    });
    return {
      result: { taxId: value },
      changes: [
        {
          eventKey: 'directory.tax_id.revealed',
          recordId: row.party_id,
          details: { kind: row.kind, record_table: table },
        },
      ],
    };
  });
}
