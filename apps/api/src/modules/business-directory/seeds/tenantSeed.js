/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The directory rows a tenant starts with (M0005-R017, R022): the
 * default labels, and for a customer tenant its first administrator as an
 * employee with a primary email.
 * Tenant provisioning runs it as `nap-admin` inside the seed stage's cell
 * transaction. Every step is idempotent, so a retried stage finds the rows
 * and adds nothing.
 */

import { setTenant } from '../../../infrastructure/runtime/tenantTransaction.js';

/**
 * Default labels by group (R017). A name appears in each group where it is
 * a sensible category.
 */
export const DEFAULT_LABELS = Object.freeze({
  email: ['work', 'home', 'spouse', 'emergency'],
  phone: ['work', 'home', 'mobile', 'spouse', 'emergency'],
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
  await setTenant(tx, tenantId);
  const existing = await db.contact_labels.rows(
    {},
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
  await setTenant(tx, tenantId);
  const rows = await db.contact_labels.rows({}, { tx, includeArchived: true });
  const have = new Set(rows.map(row => `${row.applies_to}:${row.name}`));
  return Object.entries(DEFAULT_LABELS).every(([appliesTo, names]) =>
    names.every(name => have.has(`${appliesTo}:${name}`))
  );
}

/**
 * @typedef {object} FirstAdministrator
 * @property {string} tenantId
 * @property {string} partyId The membership's `member_id` (R021).
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email The login email, stored as the primary email.
 */

/**
 * Seed a customer tenant's directory: the default labels, the first
 * administrator as an employee marked as a portal user, and their primary
 * email (R022).
 * @param {object} db Cell repository handle.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {FirstAdministrator} admin
 * @returns {Promise<void>}
 */
export async function seedDirectoryTenant(db, tx, admin) {
  const { tenantId, partyId, firstName, lastName, email } = admin;
  await seedDirectoryLabels(db, tx, tenantId);
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
    { party_id: partyId, type: 'email', is_primary: true },
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
  const { tenantId, partyId, firstName, lastName, email } = admin;
  if (!(await directoryLabelsPresent(db, tx, tenantId))) return false;
  const party = await db.parties.byKey(partyId, { tx });
  const person = await db.people.byKey(partyId, { tx });
  const [primaryEmail] = await db.contact_methods.rows(
    { party_id: partyId, type: 'email', is_primary: true },
    { tx }
  );
  return Boolean(
    party?.kind === 'employee' &&
    person &&
    !person.deactivated_at &&
    person.first_name === firstName &&
    person.last_name === lastName &&
    person.is_portal_user &&
    primaryEmail?.value === email
  );
}
