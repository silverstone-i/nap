/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The directory rows a tenant starts with (M0005-R017, R022, R037):
 * the default labels and tax ID formats, and for a customer tenant its first
 * administrator as an employee with a primary email.
 * Tenant provisioning runs it as `nap-admin` inside the seed stage's cell
 * transaction. Every step is idempotent, so a retried stage finds the rows
 * and adds nothing.
 */

import { SYSTEM_DESIGNATIONS } from '../models/contact_designations.js';

/**
 * Default labels by group (R017). A name appears in each group where it is
 * a sensible category.
 */
export const DEFAULT_LABELS = Object.freeze({
  email: ['work', 'home', 'spouse', 'emergency'],
  phone: ['work', 'home', 'mobile', 'billing', 'spouse', 'emergency'],
  address: ['work', 'home', 'billing', 'location'],
});

/**
 * Create any default label the tenant lacks, archived ones included.
 * @param {object} db Cell repository handle.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
export async function seedDirectoryLabels(db, tx, tenantId) {
  const existing = await db.contact_labels.rows(
    { tenant_id: tenantId },
    { tx, includeArchived: true }
  );
  const have = new Set(existing.map(row => `${row.applies_to}:${row.name}`));
  for (const [appliesTo, names] of Object.entries(DEFAULT_LABELS))
    for (const name of names)
      if (!have.has(`${appliesTo}:${name}`))
        await db.contact_labels.insert(
          { tenant_id: tenantId, applies_to: appliesTo, name },
          { tx }
        );
}

/**
 * Whether every default label exists. Writes nothing.
 * @param {object} db
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {string} tenantId
 * @returns {Promise<boolean>}
 */
export async function directoryLabelsPresent(db, tx, tenantId) {
  const rows = await db.contact_labels.rows(
    { tenant_id: tenantId },
    { tx, includeArchived: true }
  );
  const have = new Set(rows.map(row => `${row.applies_to}:${row.name}`));
  return Object.entries(DEFAULT_LABELS).every(([appliesTo, names]) =>
    names.every(name => have.has(`${appliesTo}:${name}`))
  );
}

/** Default tax ID formats (R037). */
export const DEFAULT_TAX_ID_FORMATS = Object.freeze([
  Object.freeze({ country: 'US', name: 'SSN', mask: '###-##-####' }),
  Object.freeze({ country: 'US', name: 'EIN', mask: '##-#######' }),
  Object.freeze({ country: 'US', name: 'ITIN', mask: '###-##-####' }),
]);

/** @param {{country: string, name: string}} format */
const formatKey = format => `${format.country}:${format.name}`;

/**
 * Create any default tax ID format the tenant lacks, archived ones included.
 * @param {object} db Cell repository handle.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
export async function seedTaxIdFormats(db, tx, tenantId) {
  const existing = await db.tax_id_formats.rows(
    { tenant_id: tenantId },
    { tx, includeArchived: true }
  );
  const have = new Set(existing.map(formatKey));
  for (const format of DEFAULT_TAX_ID_FORMATS)
    if (!have.has(formatKey(format)))
      await db.tax_id_formats.insert(
        { tenant_id: tenantId, ...format },
        { tx }
      );
}

/**
 * Whether every default tax ID format exists. Writes nothing.
 * @param {object} db
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {string} tenantId
 * @returns {Promise<boolean>}
 */
export async function taxIdFormatsPresent(db, tx, tenantId) {
  const rows = await db.tax_id_formats.rows(
    { tenant_id: tenantId },
    { tx, includeArchived: true }
  );
  const have = new Set(rows.map(formatKey));
  return DEFAULT_TAX_ID_FORMATS.every(format => have.has(formatKey(format)));
}

/**
 * @typedef {object} FirstAdministrator
 * @property {string} tenantId
 * @property {string} partyId The membership's `member_id` (R021).
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email The login email, stored as the primary email.
 * @property {string} phone Stored as the primary phone (I0013-R004).
 */

/**
 * Seed a customer tenant's directory: the default labels and tax ID
 * formats, the first
 * administrator as an employee marked as a portal user, with their primary
 * email and phone, holding every system contact designation for the tenant
 * (R022, I0013-R004, I0014-R006).
 * @param {object} db Cell repository handle.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {FirstAdministrator} admin
 * @returns {Promise<void>}
 */
export async function seedDirectoryTenant(db, tx, admin) {
  const { tenantId, partyId, firstName, lastName, email, phone } = admin;
  await seedDirectoryLabels(db, tx, tenantId);
  await seedTaxIdFormats(db, tx, tenantId);
  if (!(await db.parties.byKey(partyId, { tx })))
    await db.parties.insertWithId(
      { id: partyId, tenant_id: tenantId, kind: 'employee' },
      { tx }
    );
  if (!(await db.people.byKey(partyId, { tx })))
    await db.people.insert(
      {
        party_id: partyId,
        tenant_id: tenantId,
        first_name: firstName,
        last_name: lastName,
        is_portal_user: true,
      },
      { tx }
    );
  const [primaryEmail] = await db.contact_methods.rows(
    { tenant_id: tenantId, party_id: partyId, type: 'email', is_primary: true },
    { tx }
  );
  if (!primaryEmail)
    await db.contact_methods.insert(
      {
        tenant_id: tenantId,
        party_id: partyId,
        type: 'email',
        value: email,
        is_primary: true,
      },
      { tx }
    );
  const [primaryPhone] = await db.contact_methods.rows(
    { tenant_id: tenantId, party_id: partyId, type: 'phone', is_primary: true },
    { tx }
  );
  if (!primaryPhone)
    await db.contact_methods.insert(
      {
        tenant_id: tenantId,
        party_id: partyId,
        type: 'phone',
        value: phone,
        is_primary: true,
      },
      { tx }
    );
  // I0014-R006: the administrator starts as the holder of every designation.
  const held = await db.contact_designations.rows(
    { person_id: partyId },
    { tx }
  );
  for (const designation of SYSTEM_DESIGNATIONS)
    if (!held.some(row => row.designation === designation))
      await db.contact_designations.insert(
        { tenant_id: tenantId, person_id: partyId, designation },
        { tx }
      );
  // I0014-R026: Napsoft's copy of the administrator with those designations.
  const queued = await db.outbox.findOneBy(
    { topic: 'tenant_contact', entity_id: partyId },
    { tx }
  );
  if (!queued)
    await db.outbox.insert(
      {
        tenant_id: tenantId,
        topic: 'tenant_contact',
        entity_id: partyId,
        revision: 1,
        payload: {
          tenant_id: tenantId,
          party_id: partyId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          designations: [...SYSTEM_DESIGNATIONS],
        },
      },
      { tx }
    );
}

/**
 * Read the customer-tenant directory seed back and confirm it is complete.
 * Writes nothing.
 * @param {object} db Cell repository handle.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {FirstAdministrator} admin
 * @returns {Promise<boolean>}
 */
export async function directorySeedPresent(db, tx, admin) {
  const { tenantId, partyId, firstName, lastName, email, phone } = admin;
  if (!(await directoryLabelsPresent(db, tx, tenantId))) return false;
  if (!(await taxIdFormatsPresent(db, tx, tenantId))) return false;
  const party = await db.parties.byKey(partyId, { tx });
  const person = await db.people.byKey(partyId, { tx });
  const [primaryEmail] = await db.contact_methods.rows(
    { tenant_id: tenantId, party_id: partyId, type: 'email', is_primary: true },
    { tx }
  );
  const [primaryPhone] = await db.contact_methods.rows(
    { tenant_id: tenantId, party_id: partyId, type: 'phone', is_primary: true },
    { tx }
  );
  const held = await db.contact_designations.rows(
    { person_id: partyId },
    { tx }
  );
  // `nap-admin` is not filtered by row-level security: a party ID found in
  // another tenant is not this tenant's seed.
  return Boolean(
    party?.tenant_id === tenantId &&
    party.kind === 'employee' &&
    person?.tenant_id === tenantId &&
    !person.deactivated_at &&
    person.first_name === firstName &&
    person.last_name === lastName &&
    person.is_portal_user &&
    SYSTEM_DESIGNATIONS.every(designation =>
      held.some(row => row.designation === designation)
    ) &&
    primaryEmail?.value === email &&
    primaryPhone?.value === phone
  );
}
