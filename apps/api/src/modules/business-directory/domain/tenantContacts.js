/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The tenant's primary and billing contacts (M0005-R018, R019). Only
 * an active employee holds a designation, any number of employees may hold
 * each, and the last primary contact cannot be removed. Every removal locks
 * the tenant's active primary rows first, so two concurrent removals cannot
 * both see another primary and leave none.
 */

import { z } from 'zod';
import { DirectoryError } from './errors.js';
import { mutate, parse, parseId, read } from './shared.js';

/** Tenant contact designations (R018). */
export const DESIGNATIONS = Object.freeze(['primary', 'billing']);

const designation = z.enum(DESIGNATIONS);

/**
 * A designation change for the outbox.
 * @param {string} action `added` or `removed`.
 * @param {object} row `tenant_contacts` row.
 * @returns {import('./shared.js').DirectoryChange}
 */
function designationChange(action, row) {
  return {
    eventKey: `directory.tenant_contact.${action}`,
    recordId: row.id,
    details: { party_id: row.party_id, designation: row.designation },
  };
}

/**
 * Refuse to end `rows` if they include the tenant's last active primary
 * contact (R019). Locks every active primary row first.
 * @param {object} context
 * @param {object[]} ending Rows about to be archived.
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {DirectoryError} `LAST_PRIMARY_CONTACT`
 */
async function requireRemainingPrimary(context, ending, tx) {
  if (!ending.some(row => row.designation === 'primary')) return;
  const primaries = await context.cell.tenant_contacts.rows(
    { designation: 'primary' },
    { tx, lock: true }
  );
  const endingIds = new Set(ending.map(row => row.id));
  if (!primaries.some(row => !endingIds.has(row.id)))
    throw new DirectoryError('LAST_PRIMARY_CONTACT');
}

/**
 * Archive an employee's designations when the employee is archived. Refused
 * when that would leave no primary contact.
 * @param {object} context
 * @param {string} partyId
 * @param {object} tx
 * @returns {Promise<import('./shared.js').DirectoryChange[]>}
 * @throws {DirectoryError} `LAST_PRIMARY_CONTACT`
 */
export async function endDesignations(context, partyId, tx) {
  const rows = await context.cell.tenant_contacts.rows(
    { party_id: partyId },
    { tx, lock: true }
  );
  await requireRemainingPrimary(context, rows, tx);
  const changes = [];
  for (const row of rows) {
    await context.cell.tenant_contacts.saveRevision(
      row.id,
      { archived: true },
      context.actorId,
      { tx }
    );
    changes.push(designationChange('removed', row));
  }
  return changes;
}

/**
 * The tenant's active designations with each employee's name and primary
 * email.
 * @param {import('./shared.js').DirectoryContext} context
 * @returns {Promise<object[]>}
 */
export function listTenantContacts(context) {
  return read(context, async tx => {
    const rows = await context.cell.tenant_contacts.rows(
      {},
      { tx, orderBy: ['designation', 'created_at', 'id'] }
    );
    const ids = [...new Set(rows.map(row => row.party_id))];
    const people = new Map(
      (await context.cell.people.byKeys(ids, { tx })).map(p => [p.party_id, p])
    );
    const emails = new Map(
      (await context.cell.contact_methods.primariesFor(ids, { tx }))
        .filter(row => row.type === 'email')
        .map(row => [row.party_id, row.value])
    );
    return rows.map(row => ({
      partyId: row.party_id,
      designation: row.designation,
      firstName: people.get(row.party_id)?.first_name ?? null,
      lastName: people.get(row.party_id)?.last_name ?? null,
      primaryEmail: emails.get(row.party_id) ?? null,
    }));
  });
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
  const kind = parse(designation, value);
  return mutate(context, async tx => {
    const party = await context.cell.parties.byKey(key, { tx });
    if (!party) throw new DirectoryError('NOT_FOUND');
    const person = await context.cell.people.byKey(key, { tx, lock: true });
    if (party.kind !== 'employee' || !person || person.deactivated_at)
      throw new DirectoryError('NOT_EMPLOYEE');
    const [existing] = await context.cell.tenant_contacts.rows(
      { party_id: key, designation: kind },
      { tx }
    );
    if (existing)
      return { result: { partyId: key, designation: kind }, changes: [] };
    const row = await context.cell.tenant_contacts.insert(
      {
        tenant_id: context.tenant.id,
        party_id: key,
        designation: kind,
        created_by: context.actorId,
        updated_by: context.actorId,
      },
      { tx }
    );
    return {
      result: { partyId: key, designation: kind },
      changes: [designationChange('added', row)],
    };
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
  const kind = parse(designation, value);
  return mutate(context, async tx => {
    const [row] = await context.cell.tenant_contacts.rows(
      { party_id: key, designation: kind },
      { tx, lock: true }
    );
    if (!row) throw new DirectoryError('NOT_FOUND');
    await requireRemainingPrimary(context, [row], tx);
    await context.cell.tenant_contacts.saveRevision(
      row.id,
      { archived: true },
      context.actorId,
      { tx }
    );
    return {
      result: { partyId: key, designation: kind },
      changes: [designationChange('removed', row)],
    };
  });
}
