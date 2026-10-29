/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Kind labels shown in forms and lists. */
export const KIND_LABELS = {
  employee: 'Employee',
  contact: 'Contact',
  vendor: 'Vendor',
  client: 'Client',
  vendor_contact: 'Vendor contact',
  client_contact: 'Client contact',
};

/**
 * The display name of any record.
 * @param {object} record
 * @returns {string}
 */
export function recordName(record) {
  if (record.firstName !== undefined)
    return `${record.firstName} ${record.lastName}`;
  return record.legalName;
}

/**
 * What an empty directory list says (M0005-R062), by view and search.
 * @param {string} plural Such as `vendors`.
 * @param {boolean} archived Whether the list shows the Archived view.
 * @param {boolean} searching Whether a search or filter is on.
 * @returns {string}
 */
export function emptyListMessage(plural, archived, searching) {
  if (searching) return `No ${plural} match.`;
  return archived ? `No archived ${plural}.` : `No ${plural} yet.`;
}

/**
 * Where a match's Open link goes: the record's list, or an organization
 * contact's organization, in the Archived view when that record is
 * archived (M0005-R067).
 * @param {{id: string, kind: string, archived: boolean, organization: {id: string, archived: boolean}|null}} match
 * @returns {string}
 */
export function matchTarget(match) {
  const { organization } = match;
  const [kind, id, archived] = organization
    ? [
        match.kind.replace('_contact', ''),
        organization.id,
        organization.archived,
      ]
    : [match.kind, match.id, match.archived];
  return recordLink(kind, id, archived);
}

/**
 * The address that opens a record on its list, in the Archived view when
 * it is archived, such as `/directory/vendors?open={id}`.
 * @param {string} kind A kind with its own list: employee, contact, vendor, or client.
 * @param {string} id
 * @param {boolean} archived
 * @returns {string}
 */
export function recordLink(kind, id, archived) {
  const params = new URLSearchParams(
    archived ? { view: 'archived', open: id } : { open: id }
  );
  return `/directory/${kind}s?${params}`;
}
