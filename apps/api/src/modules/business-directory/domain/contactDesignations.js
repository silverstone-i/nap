/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Contact designations (I0014-R001–R014, R021). A person or an organization
 * email holds system designations and designation tags in `app.contact_designations`. A customer
 * tenant's employees hold them for the tenant, and Napsoft keeps a copy of
 * those who hold a system designation (R026). An organization's `billing` holders
 * must be able to receive what its bill-to addresses send (R009), and
 * `resolveRecipients` is the one definition of who receives an
 * organization's invoices and payment questions.
 */

import { z } from 'zod';
import { requestTenantContact } from '../../cell-tenancy/domain/companyProfile.js';
import { SYSTEM_DESIGNATIONS } from '../models/contact_designations.js';
import { DirectoryError } from './errors.js';
import {
  COMPANY_PROFILE_WRITE,
  mutate,
  parse,
  parseId,
  read,
  requireCapability,
  requireRevision,
  revision,
  uuid,
} from './shared.js';

/** I0014-R007: the error for a customer tenant left without a designation's holder. */
const LAST_HOLDER = Object.freeze({
  primary: 'LAST_PRIMARY_CONTACT',
  billing: 'LAST_BILLING_CONTACT',
  notifications: 'LAST_NOTIFICATIONS_CONTACT',
});

const designationEntry = z.strictObject({
  designation: z.enum(SYSTEM_DESIGNATIONS),
  addressId: uuid.nullable().optional(),
  copyAll: z.boolean().optional(),
});
const personDesignationsBody = z.strictObject({
  revision,
  designations: z.array(designationEntry).max(20),
  tagIds: z.array(uuid).max(50).optional(),
});
const emailDesignationsBody = z.strictObject({
  revision,
  designations: z.array(designationEntry).max(20),
});
const recipientsQuery = z.strictObject({
  purpose: z.enum(['bill_to', 'remit_to']),
  addressId: uuid.optional(),
});

/**
 * Each party's primary email and primary phone, in one query.
 * @param {object} tx
 * @param {string[]} partyIds
 * @returns {Promise<Map<string, {email: string|null, phone: string|null}>>}
 */
export async function contactDetailsOf(tx, partyIds) {
  const rows = await tx.any(
    `SELECT id,
       (SELECT value FROM app.contact_methods
         WHERE party_id=x.id AND type='email' AND is_primary
           AND deactivated_at IS NULL LIMIT 1) AS email,
       (SELECT value FROM app.contact_methods
         WHERE party_id=x.id AND type='phone' AND is_primary
           AND deactivated_at IS NULL LIMIT 1) AS phone
       FROM unnest($1::uuid[]) AS x(id)`,
    [partyIds]
  );
  return new Map(
    rows.map(row => [row.id, { email: row.email, phone: row.phone }])
  );
}

/**
 * The designations and tags each holder holds, keyed by person ID or contact
 * method ID: `{ contactDesignations: [{ designation, addressId, copyAll }], tags: [{ id, name }] }`.
 * @param {object} tx
 * @param {{personIds?: string[], methodIds?: string[]}} holders
 * @returns {Promise<Map<string, {contactDesignations: object[], tags: object[]}>>}
 */
export async function designationViewsOf(
  tx,
  { personIds = [], methodIds = [] }
) {
  const map = new Map(
    [...personIds, ...methodIds].map(id => [
      id,
      { contactDesignations: [], tags: [] },
    ])
  );
  if (map.size === 0) return map;
  const rows = await tx.any(
    `SELECT r.person_id, r.contact_method_id, r.designation, r.address_id,
            r.copy_all, r.label_id, l.name AS label_name
       FROM app.contact_designations r
       LEFT JOIN app.contact_labels l ON l.id=r.label_id
      WHERE r.deactivated_at IS NULL
        AND (r.person_id = ANY($1::uuid[]) OR r.contact_method_id = ANY($2::uuid[]))
      ORDER BY array_position($3::text[], r.designation::text), l.name, r.address_id`,
    [personIds, methodIds, SYSTEM_DESIGNATIONS]
  );
  for (const row of rows) {
    const entry = map.get(row.person_id ?? row.contact_method_id);
    if (row.designation)
      entry.contactDesignations.push({
        designation: row.designation,
        addressId: row.address_id,
        copyAll: row.copy_all,
      });
    else entry.tags.push({ id: row.label_id, name: row.label_name });
  }
  return map;
}

/**
 * The system designations an active employee holds; none when archived.
 * @param {object} tx
 * @param {string} partyId
 * @returns {Promise<string[]>}
 */
async function heldDesignations(tx, partyId) {
  const rows = await tx.any(
    `SELECT DISTINCT r.designation FROM app.contact_designations r
       JOIN app.people p ON p.party_id=r.person_id
      WHERE r.person_id=$1 AND r.designation IS NOT NULL
        AND r.deactivated_at IS NULL AND p.deactivated_at IS NULL`,
    [partyId]
  );
  return SYSTEM_DESIGNATIONS.filter(designation =>
    rows.some(row => row.designation === designation)
  );
}

/**
 * Whether an active person holds any system designation.
 * @param {object} tx
 * @param {string} partyId
 * @returns {Promise<boolean>}
 */
export async function holdsSystemDesignation(tx, partyId) {
  return (await heldDesignations(tx, partyId)).length > 0;
}

/**
 * An employee's `people` row, or null for any other party.
 * @param {object} tx
 * @param {string} partyId
 * @returns {Promise<object|null>}
 */
async function employee(tx, partyId) {
  return tx.oneOrNone(
    `SELECT p.* FROM app.people p JOIN app.parties x ON x.id=p.party_id
      WHERE p.party_id=$1 AND x.kind='employee'`,
    [partyId]
  );
}

/**
 * Require a customer tenant to keep a holder of each system designation among its
 * active employees (I0014-R006, R007).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {DirectoryError} `LAST_PRIMARY_CONTACT`, `LAST_BILLING_CONTACT`, `LAST_NOTIFICATIONS_CONTACT`
 */
export async function requireDesignationCounts(context, tx) {
  if (context.tenant.isNapsoft) return;
  const rows = await tx.any(
    `SELECT DISTINCT r.designation FROM app.contact_designations r
       JOIN app.people p ON p.party_id=r.person_id
      WHERE r.tenant_id=$1 AND r.organization_id IS NULL AND r.designation IS NOT NULL
        AND r.deactivated_at IS NULL AND p.deactivated_at IS NULL`,
    [context.tenant.id]
  );
  for (const designation of SYSTEM_DESIGNATIONS)
    if (!rows.some(row => row.designation === designation))
      throw new DirectoryError(LAST_HOLDER[designation]);
}

/**
 * Require a customer tenant's designation holder's details (I0014-R008): a primary
 * email for every designation, and a primary phone for `primary`.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {string} partyId
 * @returns {Promise<void>}
 * @throws {DirectoryError} `CONTACT_DETAILS_REQUIRED`
 */
async function requireEmployeeDetails(context, tx, partyId) {
  if (context.tenant.isNapsoft) return;
  const designations = await heldDesignations(tx, partyId);
  if (designations.length === 0) return;
  const details = (await contactDetailsOf(tx, [partyId])).get(partyId);
  if (!details.email || (designations.includes('primary') && !details.phone))
    throw new DirectoryError('CONTACT_DETAILS_REQUIRED');
}

/**
 * Require every `billing` holder of an organization to meet the delivery
 * method of each bill-to address it serves (I0014-R009): an email for
 * `email`, portal access for `portal`, nothing for `mail`. Holders that are
 * archived, or whose email is removed, no longer hold the designation.
 * @param {object} tx
 * @param {string} organizationId
 * @returns {Promise<void>}
 * @throws {DirectoryError} `CONTACT_DETAILS_REQUIRED`
 */
export async function requireOrganizationHolders(tx, organizationId) {
  const billTos = await tx.any(
    `SELECT ap.address_id, ap.delivery_method
       FROM app.address_purposes ap
       JOIN app.addresses a ON a.id=ap.address_id
      WHERE ap.party_id=$1 AND ap.purpose='bill_to'
        AND ap.deactivated_at IS NULL AND a.deactivated_at IS NULL`,
    [organizationId]
  );
  if (billTos.length === 0) return;
  const holders = await tx.any(
    `SELECT r.address_id, r.contact_method_id, p.is_portal_user,
            (SELECT 1 FROM app.contact_methods m
              WHERE m.party_id=r.person_id AND m.type='email' AND m.is_primary
                AND m.deactivated_at IS NULL LIMIT 1) IS NOT NULL AS has_email
       FROM app.contact_designations r
       LEFT JOIN app.people p ON p.party_id=r.person_id
       LEFT JOIN app.contact_methods cm ON cm.id=r.contact_method_id
      WHERE r.organization_id=$1 AND r.designation='billing'
        AND r.deactivated_at IS NULL
        AND (p.party_id IS NULL OR p.deactivated_at IS NULL)
        AND (cm.id IS NULL OR cm.deactivated_at IS NULL)`,
    [organizationId]
  );
  for (const holder of holders)
    for (const billTo of billTos) {
      if (holder.address_id && holder.address_id !== billTo.address_id)
        continue;
      const isEmail = holder.contact_method_id !== null;
      const ok =
        billTo.delivery_method === 'mail' ||
        (billTo.delivery_method === 'email' && (isEmail || holder.has_email)) ||
        (billTo.delivery_method === 'portal' &&
          !isEmail &&
          holder.is_portal_user);
      if (!ok) throw new DirectoryError('CONTACT_DETAILS_REQUIRED');
    }
}

/**
 * Re-check the designation rules a party's details feed (I0014-R008–R010): a
 * customer tenant employee's own details, or its organization's billing
 * holders for an organization contact or an organization.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {string} partyId
 * @returns {Promise<void>}
 * @throws {DirectoryError} `CONTACT_DETAILS_REQUIRED`
 */
export async function requireContactDetails(context, tx, partyId) {
  const row = await tx.oneOrNone(
    `SELECT x.kind, p.organization_id FROM app.parties x
       LEFT JOIN app.people p ON p.party_id=x.id WHERE x.id=$1`,
    [partyId]
  );
  if (!row) return;
  if (row.kind === 'employee')
    return requireEmployeeDetails(context, tx, partyId);
  if (row.kind === 'vendor' || row.kind === 'client')
    return requireOrganizationHolders(tx, partyId);
  if (row.organization_id)
    return requireOrganizationHolders(tx, row.organization_id);
}

/**
 * Queue Napsoft's copy of a customer tenant's employee (I0014-R026): its
 * names, primary email and phone, and the system designations it holds. An
 * employee with no designation, or archived, goes as a removal (`designations: []`).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {string} partyId
 * @param {boolean} wasContact Whether the copy may hold the employee now.
 * @returns {Promise<void>}
 */
export async function syncContact(context, tx, partyId, wasContact) {
  if (context.tenant.isNapsoft) return;
  const person = await employee(tx, partyId);
  if (!person) return;
  const designations = await heldDesignations(tx, partyId);
  if (designations.length === 0 && !wasContact) return;
  const details = (await contactDetailsOf(tx, [partyId])).get(partyId);
  await requestTenantContact(tx, {
    tenant_id: context.tenant.id,
    party_id: partyId,
    first_name: person.first_name,
    last_name: person.last_name,
    email: details.email,
    phone: details.phone,
    designations,
  });
}

/**
 * Serialize designation changes per organization, or per tenant for its
 * employees, so the minimums and holder rules see one change at a time.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {string|null} organizationId
 * @returns {Promise<void>}
 */
async function lockDesignations(context, tx, organizationId) {
  await tx.one('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `business-directory:contact-designations:${organizationId ?? context.tenant.id}`,
  ]);
}

/**
 * Check one requested system designation against its holder (I0014-R003, R005,
 * R013, R014), and return its row key.
 * @param {object} tx
 * @param {{designation: string, addressId?: string|null, copyAll?: boolean}} entry
 * @param {{organizationId: string|null}} holder
 * @returns {Promise<{designation: string, addressId: string|null, copyAll: boolean}>}
 * @throws {DirectoryError} `INVALID_INPUT`, `INVALID_STATE`
 */
async function checkEntry(tx, entry, { organizationId }) {
  const addressId = entry.addressId ?? null;
  const copyAll = entry.copyAll ?? false;
  if (entry.designation === 'notifications' && organizationId)
    throw new DirectoryError('INVALID_STATE');
  if ((addressId || copyAll) && entry.designation !== 'billing')
    throw new DirectoryError('INVALID_INPUT');
  if (addressId && copyAll) throw new DirectoryError('INVALID_INPUT');
  // A customer tenant's employees have no scope until Companies (R013).
  if ((addressId || copyAll) && !organizationId)
    throw new DirectoryError('INVALID_INPUT');
  if (addressId) {
    const billTo = await tx.oneOrNone(
      `SELECT 1 FROM app.address_purposes ap
         JOIN app.addresses a ON a.id=ap.address_id
        WHERE ap.address_id=$1 AND ap.party_id=$2 AND ap.purpose='bill_to'
          AND ap.deactivated_at IS NULL AND a.deactivated_at IS NULL`,
      [addressId, organizationId]
    );
    if (!billTo) throw new DirectoryError('INVALID_STATE');
  }
  return { designation: entry.designation, addressId, copyAll };
}

/**
 * Replace a holder's designations and tags with `wanted` in place: archive what is
 * gone, insert what is new, and save a changed `copy_all`.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {{person_id?: string, contact_method_id?: string, organization_id: string|null}} holder
 * @param {{designation: string|null, labelId: string|null, addressId: string|null, copyAll: boolean}[]} wanted
 * @returns {Promise<void>}
 */
async function replaceDesignations(context, tx, holder, wanted) {
  const where = holder.person_id
    ? { person_id: holder.person_id }
    : { contact_method_id: holder.contact_method_id };
  const key = row => `${row.designation ?? row.labelId}|${row.addressId ?? ''}`;
  const existing = (
    await context.cell.contact_designations.rows(where, { tx, lock: true })
  ).map(row => ({
    row,
    key: key({
      designation: row.designation,
      labelId: row.label_id,
      addressId: row.address_id,
    }),
  }));
  const wantedKeys = new Set(wanted.map(key));
  for (const { row, key: existingKey } of existing)
    if (!wantedKeys.has(existingKey))
      await context.cell.contact_designations.saveRevision(
        row.id,
        { archived: true },
        context.actorId,
        { tx }
      );
  for (const entry of wanted) {
    const found = existing.find(item => item.key === key(entry));
    if (found) {
      if (found.row.copy_all !== entry.copyAll)
        await context.cell.contact_designations.saveRevision(
          found.row.id,
          { copy_all: entry.copyAll },
          context.actorId,
          { tx }
        );
      continue;
    }
    await context.cell.contact_designations.insert(
      {
        tenant_id: context.tenant.id,
        organization_id: holder.organization_id,
        person_id: holder.person_id ?? null,
        contact_method_id: holder.contact_method_id ?? null,
        designation: entry.designation,
        label_id: entry.labelId,
        address_id: entry.addressId,
        copy_all: entry.copyAll,
        created_by: context.actorId,
        updated_by: context.actorId,
      },
      { tx }
    );
  }
}

/**
 * Refuse a repeated designation and scope in one request.
 * @param {{designation: string, addressId: string|null}[]} entries
 * @returns {void}
 * @throws {DirectoryError} `INVALID_INPUT`
 */
function requireDistinct(entries) {
  const keys = entries.map(
    entry => `${entry.designation}|${entry.addressId ?? ''}`
  );
  if (new Set(keys).size !== keys.length)
    throw new DirectoryError('INVALID_INPUT');
}

/**
 * Replace a person's designations and tags as one set (I0014-R011). A customer
 * tenant's employee needs `company-profile::write`; a standalone contact
 * and a Napsoft employee hold no designations (R005).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} id
 * @param {unknown} body `{ revision, designations: [{ designation, addressId?, copyAll? }], tagIds? }`
 * @returns {Promise<{contactDesignations: object[], tags: object[], revision: number}>}
 * @throws {DirectoryError} `NOT_FOUND`, `INVALID_INPUT`, `INVALID_STATE`, `FORBIDDEN`, `STALE_REVISION`, `CONTACT_DETAILS_REQUIRED`, `LAST_*_CONTACT`
 */
export async function setPersonDesignations(context, id, body) {
  const key = parseId(id);
  const input = parse(personDesignationsBody, body);
  const tagIds = input.tagIds ?? [];
  if (new Set(tagIds).size !== tagIds.length)
    throw new DirectoryError('INVALID_INPUT');
  return mutate(context, async tx => {
    const person = await context.cell.people.byKey(key, { tx, lock: true });
    if (!person) throw new DirectoryError('NOT_FOUND');
    const party = await context.cell.parties.byKey(key, { tx });
    requireRevision(person, input.revision);
    if (
      party.kind === 'contact' ||
      (party.kind === 'employee' && context.tenant.isNapsoft)
    )
      throw new DirectoryError('INVALID_STATE');
    if (person.deactivated_at) throw new DirectoryError('INVALID_STATE');
    if (party.kind === 'employee')
      await requireCapability(context, COMPANY_PROFILE_WRITE);
    const organizationId = person.organization_id;
    await lockDesignations(context, tx, organizationId);
    const entries = [];
    for (const entry of input.designations)
      entries.push(await checkEntry(tx, entry, { organizationId }));
    requireDistinct(entries);
    for (const tagId of tagIds) {
      const label = await context.cell.contact_labels.byKey(tagId, { tx });
      if (!label || label.deactivated_at || label.applies_to !== 'designation')
        throw new DirectoryError('INVALID_INPUT');
    }
    const wasContact = await holdsSystemDesignation(tx, key);
    const before = (await designationViewsOf(tx, { personIds: [key] })).get(
      key
    );
    await replaceDesignations(
      context,
      tx,
      { person_id: key, organization_id: organizationId },
      [
        ...entries.map(entry => ({ ...entry, labelId: null })),
        ...tagIds.map(labelId => ({
          designation: null,
          labelId,
          addressId: null,
          copyAll: false,
        })),
      ]
    );
    const saved = await context.cell.people.saveRevision(
      key,
      {},
      context.actorId,
      { tx }
    );
    if (party.kind === 'employee') {
      await requireEmployeeDetails(context, tx, key);
      await requireDesignationCounts(context, tx);
      await syncContact(context, tx, key, wasContact);
    } else await requireOrganizationHolders(tx, organizationId);
    const after = (await designationViewsOf(tx, { personIds: [key] })).get(key);
    return {
      result: { ...after, revision: saved.revision },
      changes: [
        {
          eventKey: 'directory.contact_designations.updated',
          recordId: key,
          details: {
            kind: party.kind,
            before: JSON.stringify(before),
            after: JSON.stringify(after),
          },
        },
      ],
    };
  });
}

/**
 * Replace the `billing` designations of an organization's own email (I0014-R012),
 * with the same scope and `copy_all` rules as a person.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} partyId The organization.
 * @param {unknown} methodId
 * @param {unknown} body `{ revision, designations: [{ designation: 'billing', addressId?, copyAll? }] }`
 * @returns {Promise<{contactDesignations: object[], tags: object[], revision: number}>}
 * @throws {DirectoryError} `NOT_FOUND`, `INVALID_INPUT`, `INVALID_STATE`, `STALE_REVISION`, `CONTACT_DETAILS_REQUIRED`
 */
export async function setEmailDesignations(context, partyId, methodId, body) {
  const organizationId = parseId(partyId);
  const key = parseId(methodId);
  const input = parse(emailDesignationsBody, body);
  return mutate(context, async tx => {
    const party = await context.cell.parties.byKey(organizationId, { tx });
    if (!party) throw new DirectoryError('NOT_FOUND');
    const method = await context.cell.contact_methods.byKey(key, {
      tx,
      lock: true,
    });
    if (!method || method.party_id !== organizationId || method.deactivated_at)
      throw new DirectoryError('NOT_FOUND');
    requireRevision(method, input.revision);
    if (
      method.type !== 'email' ||
      (party.kind !== 'vendor' && party.kind !== 'client')
    )
      throw new DirectoryError('INVALID_STATE');
    await lockDesignations(context, tx, organizationId);
    const entries = [];
    for (const entry of input.designations) {
      if (entry.designation !== 'billing')
        throw new DirectoryError('INVALID_STATE');
      entries.push(await checkEntry(tx, entry, { organizationId }));
    }
    requireDistinct(entries);
    const before = (await designationViewsOf(tx, { methodIds: [key] })).get(
      key
    );
    await replaceDesignations(
      context,
      tx,
      { contact_method_id: key, organization_id: organizationId },
      entries.map(entry => ({ ...entry, labelId: null }))
    );
    const saved = await context.cell.contact_methods.saveRevision(
      key,
      {},
      context.actorId,
      { tx }
    );
    await requireOrganizationHolders(tx, organizationId);
    const after = (await designationViewsOf(tx, { methodIds: [key] })).get(key);
    return {
      result: { ...after, revision: saved.revision },
      changes: [
        {
          eventKey: 'directory.contact_designations.updated',
          recordId: key,
          details: {
            kind: party.kind,
            party_id: organizationId,
            before: JSON.stringify(before),
            after: JSON.stringify(after),
          },
        },
      ],
    };
  });
}

/**
 * End the designations an organization email held when it is removed.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {string} methodId
 * @returns {Promise<void>}
 */
export async function endEmailDesignations(context, tx, methodId) {
  for (const row of await context.cell.contact_designations.rows(
    { contact_method_id: methodId },
    { tx, lock: true }
  ))
    await context.cell.contact_designations.saveRevision(
      row.id,
      { archived: true },
      context.actorId,
      { tx }
    );
}

/**
 * Pick the first address of `purposes` that is a default, else the
 * primary address.
 * @param {object[]} addresses Active addresses, each with `purposes`.
 * @param {string[]} purposes In order of preference.
 * @returns {object|null}
 */
function fallbackAddress(addresses, purposes) {
  for (const purpose of purposes) {
    const found = addresses.find(address =>
      address.purposes.some(p => p.purpose === purpose && p.is_default)
    );
    if (found) return found;
  }
  return addresses.find(address => address.is_primary) ?? null;
}

/**
 * A Napsoft client's designation holders: its tenant's employees, from Napsoft's
 * copy in admin (I0014-R026), since they live in the tenant's own cell.
 * None until the client has a tenant. Tenant employees have no address scope
 * or `copy_all` until Companies (R013), so the copy carries neither; revisit
 * this when it does.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} clientId
 * @returns {Promise<object[]>} Holder rows shaped as the directory query's.
 */
async function tenantHolders(context, clientId) {
  if (!context.admin) throw new DirectoryError('SERVICE_UNAVAILABLE');
  const tenant = await context.admin.tenants.findOneBy(
    { client_id: clientId },
    { columnWhitelist: ['id'] }
  );
  if (!tenant) return [];
  const contacts = await context.admin.tenant_contacts.findWhere(
    { tenant_id: tenant.id },
    'AND',
    { orderBy: ['last_name', 'first_name', 'party_id'] }
  );
  return contacts.flatMap(contact =>
    contact.designations
      .filter(
        designation => designation === 'primary' || designation === 'billing'
      )
      .map(designation => ({
        designation,
        address_id: null,
        copy_all: false,
        person_id: contact.party_id,
        contact_method_id: null,
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
      }))
  );
}

/**
 * Who receives an organization's invoices or payment questions, and where
 * they go (I0014-R021). A Napsoft client's holders are its tenant's
 * employees.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} id The organization.
 * @param {unknown} query `{ purpose: 'bill_to'|'remit_to', addressId? }`
 * @returns {Promise<{address: object|null, deliveryMethod: string|null, to: object[], copy: object[]}>}
 * @throws {DirectoryError} `NOT_FOUND`, `INVALID_INPUT`
 */
export async function resolveRecipients(context, id, query) {
  const organizationId = parseId(id);
  const input = parse(recipientsQuery, query);
  if (input.purpose === 'remit_to' && input.addressId)
    throw new DirectoryError('INVALID_INPUT');
  return read(context, async tx => {
    const party = await context.cell.parties.byKey(organizationId, { tx });
    if (!party || (party.kind !== 'vendor' && party.kind !== 'client'))
      throw new DirectoryError('NOT_FOUND');
    if (input.purpose === 'remit_to' && party.kind !== 'vendor')
      throw new DirectoryError('INVALID_INPUT');
    const addresses = await context.cell.addresses.rows(
      { party_id: organizationId },
      { tx, orderBy: ['created_at', 'id'] }
    );
    const purposes = await context.cell.address_purposes.rows(
      { party_id: organizationId },
      { tx }
    );
    for (const address of addresses)
      address.purposes = purposes.filter(p => p.address_id === address.id);
    let address;
    if (input.addressId) {
      address = addresses.find(
        a =>
          a.id === input.addressId &&
          a.purposes.some(p => p.purpose === 'bill_to')
      );
      if (!address) throw new DirectoryError('INVALID_INPUT');
    } else
      address = fallbackAddress(
        addresses,
        input.purpose === 'bill_to'
          ? ['bill_to', 'location']
          : ['remit_to', 'location']
      );
    const holders = await (context.tenant.isNapsoft && party.kind === 'client'
      ? tenantHolders(context, organizationId)
      : tx.any(
          `SELECT r.designation, r.address_id, r.copy_all, r.person_id,
              r.contact_method_id, p.first_name, p.last_name, cm.value
         FROM app.contact_designations r
         LEFT JOIN app.people p ON p.party_id=r.person_id
         LEFT JOIN app.contact_methods cm ON cm.id=r.contact_method_id
        WHERE r.organization_id=$1 AND r.designation IN ('primary', 'billing')
          AND r.deactivated_at IS NULL
          AND (p.party_id IS NULL OR p.deactivated_at IS NULL)
          AND (cm.id IS NULL OR cm.deactivated_at IS NULL)
        ORDER BY p.last_name, p.first_name, cm.value`,
          [organizationId]
        ));
    const emails = await contactDetailsOf(
      tx,
      holders.filter(h => h.person_id && !h.email).map(h => h.person_id)
    );
    const recipient = holder =>
      holder.person_id
        ? {
            kind: 'person',
            id: holder.person_id,
            name: `${holder.first_name} ${holder.last_name}`,
            email: holder.email ?? emails.get(holder.person_id)?.email ?? null,
          }
        : {
            kind: 'email',
            id: holder.contact_method_id,
            name: holder.value,
            email: holder.value,
          };
    const unique = list => [
      ...new Map(
        list.map(h => [h.person_id ?? h.contact_method_id, h])
      ).values(),
    ];
    const billing = holders.filter(h => h.designation === 'billing');
    const primary = holders.filter(h => h.designation === 'primary');
    const billTo = address?.purposes.find(p => p.purpose === 'bill_to');
    let to;
    let copy = [];
    if (input.purpose === 'bill_to') {
      const scoped = address
        ? billing.filter(h => h.address_id === address.id)
        : [];
      const unscoped = billing.filter(h => !h.address_id && !h.copy_all);
      to = scoped.length ? scoped : unscoped.length ? unscoped : primary;
      const toKeys = new Set(to.map(h => h.person_id ?? h.contact_method_id));
      copy = billing.filter(
        h => h.copy_all && !toKeys.has(h.person_id ?? h.contact_method_id)
      );
    } else {
      const payable = billing.filter(h => !h.copy_all);
      to = payable.length ? payable : primary;
    }
    return {
      address: address
        ? {
            id: address.id,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            region: address.region,
            postalCode: address.postal_code,
            country: address.country,
          }
        : null,
      deliveryMethod:
        input.purpose === 'bill_to'
          ? (billTo?.delivery_method ?? 'email')
          : null,
      to: unique(to).map(recipient),
      copy: unique(copy).map(recipient),
    };
  });
}
