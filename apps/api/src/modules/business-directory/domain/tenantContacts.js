/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The tenant's primary and billing contacts (M0005-R018, R019): the
 * `is_primary_contact` and `is_billing_contact` flags on an employee's
 * `app.people` row. Only an active employee holds a designation, any number
 * of employees may hold each, and the last primary contact cannot be
 * removed. Every removal locks the tenant's primary employees first, so two
 * concurrent removals cannot both see another primary and leave none.
 */

import { z } from 'zod';
import { DirectoryError } from './errors.js';
import { mutate, parse, parseId, read } from './shared.js';

/** Tenant contact designations (R018) and the flag each one sets. */
const FLAGS = Object.freeze({
  primary: 'is_primary_contact',
  billing: 'is_billing_contact',
});

export const DESIGNATIONS = Object.freeze(Object.keys(FLAGS));

const designation = z.enum(DESIGNATIONS);

/**
 * The designations an employee's row holds.
 * @param {object} row `app.people` row.
 * @returns {string[]}
 */
export function designationsOf(row) {
  return DESIGNATIONS.filter(name => row[FLAGS[name]]);
}

/**
 * A designation change for the outbox.
 * @param {string} action `added` or `removed`.
 * @param {string} partyId
 * @param {string} name Designation.
 * @returns {import('./shared.js').DirectoryChange}
 */
function designationChange(action, partyId, name) {
  return {
    eventKey: `directory.tenant_contact.${action}`,
    recordId: partyId,
    details: { party_id: partyId, designation: name },
  };
}

/**
 * Refuse to end `partyId`'s primary designation if it is the tenant's last
 * one (R019). Locks every primary employee first.
 * @param {object} context
 * @param {string} partyId
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {DirectoryError} `LAST_PRIMARY_CONTACT`
 */
async function requireRemainingPrimary(context, partyId, tx) {
  const primaries = await context.cell.people.tenantContacts({
    tx,
    column: FLAGS.primary,
    lock: true,
  });
  if (!primaries.some(row => row.party_id !== partyId))
    throw new DirectoryError('LAST_PRIMARY_CONTACT');
}

/**
 * End an employee's designations when the employee is archived. Refused
 * when that would leave no primary contact.
 * @param {object} context
 * @param {object} employee Locked `app.people` row.
 * @param {object} tx
 * @returns {Promise<{columns: object, changes: import('./shared.js').DirectoryChange[]}>}
 *   The flag columns to clear with the archive, and the changes to record.
 * @throws {DirectoryError} `LAST_PRIMARY_CONTACT`
 */
export async function endDesignations(context, employee, tx) {
  const held = designationsOf(employee);
  if (held.includes('primary'))
    await requireRemainingPrimary(context, employee.party_id, tx);
  return {
    columns: Object.fromEntries(held.map(name => [FLAGS[name], false])),
    changes: held.map(name =>
      designationChange('removed', employee.party_id, name)
    ),
  };
}

/**
 * The tenant's active designations with each employee's name and primary
 * email.
 * @param {import('./shared.js').DirectoryContext} context
 * @returns {Promise<object[]>}
 */
export function listTenantContacts(context) {
  return read(context, async tx => {
    const people = await context.cell.people.tenantContacts({ tx });
    const emails = new Map(
      (
        await context.cell.contact_methods.primariesFor(
          people.map(p => p.party_id),
          { tx }
        )
      )
        .filter(row => row.type === 'email')
        .map(row => [row.party_id, row.value])
    );
    return DESIGNATIONS.flatMap(name =>
      people
        .filter(person => person[FLAGS[name]])
        .map(person => ({
          partyId: person.party_id,
          designation: name,
          firstName: person.first_name,
          lastName: person.last_name,
          primaryEmail: emails.get(person.party_id) ?? null,
        }))
    );
  });
}

/**
 * Lock an employee's `app.people` row.
 * @param {object} context
 * @param {string} key
 * @param {object} tx
 * @returns {Promise<object|null>} The row, or null when the party is not an employee.
 * @throws {DirectoryError} `NOT_FOUND`
 */
async function lockEmployee(context, key, tx) {
  const party = await context.cell.parties.byKey(key, { tx });
  if (!party) throw new DirectoryError('NOT_FOUND');
  const person = await context.cell.people.byKey(key, { tx, lock: true });
  return party.kind === 'employee' ? person : null;
}

/**
 * Designate an active employee. Repeating an active designation returns it
 * unchanged.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} partyId
 * @param {unknown} value `primary` or `billing`.
 * @returns {Promise<{partyId: string, designation: string}>}
 * @throws {DirectoryError} `NOT_FOUND`, `NOT_EMPLOYEE`
 */
export function addTenantContact(context, partyId, value) {
  const key = parseId(partyId);
  const name = parse(designation, value);
  return mutate(context, async tx => {
    const person = await lockEmployee(context, key, tx);
    if (!person || person.deactivated_at)
      throw new DirectoryError('NOT_EMPLOYEE');
    const result = { partyId: key, designation: name };
    if (person[FLAGS[name]]) return { result, changes: [] };
    await context.cell.people.saveRevision(
      key,
      { [FLAGS[name]]: true },
      context.actorId,
      { tx }
    );
    return { result, changes: [designationChange('added', key, name)] };
  });
}

/**
 * End a designation. Removing the last primary contact is refused (R019).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} partyId
 * @param {unknown} value
 * @returns {Promise<{partyId: string, designation: string}>}
 * @throws {DirectoryError} `NOT_FOUND`, `LAST_PRIMARY_CONTACT`
 */
export function removeTenantContact(context, partyId, value) {
  const key = parseId(partyId);
  const name = parse(designation, value);
  return mutate(context, async tx => {
    const person = await lockEmployee(context, key, tx);
    if (!person || person.deactivated_at || !person[FLAGS[name]])
      throw new DirectoryError('NOT_FOUND');
    if (name === 'primary') await requireRemainingPrimary(context, key, tx);
    await context.cell.people.saveRevision(
      key,
      { [FLAGS[name]]: false },
      context.actorId,
      { tx }
    );
    return {
      result: { partyId: key, designation: name },
      changes: [designationChange('removed', key, name)],
    };
  });
}
