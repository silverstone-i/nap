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
