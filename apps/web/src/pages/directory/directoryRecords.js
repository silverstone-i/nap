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
