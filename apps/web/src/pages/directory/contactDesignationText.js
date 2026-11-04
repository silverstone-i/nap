/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file How contact designations, address purposes, and delivery methods read on
 * screen (I0014-R028–R030).
 */

/** I0014-R015, R017: purpose and delivery method names as shown. */
export const PURPOSE_LABELS = Object.freeze({
  location: 'Location',
  bill_to: 'Bill-to',
  remit_to: 'Remit-to',
});
export const DELIVERY_LABELS = Object.freeze({
  email: 'Email',
  mail: 'Mail',
  portal: 'Portal',
});

/** I0014-R001: the system designations as shown. */
export const DESIGNATION_LABELS = Object.freeze({
  primary: 'Primary',
  billing: 'Billing',
  notifications: 'Notifications',
});

/**
 * A bill-to address's short name: its city, else its first line.
 * @param {object|undefined} address
 * @returns {string}
 */
export function addressName(address) {
  return address ? address.city || address.line1 : 'Removed address';
}

/**
 * One line naming held system designations (I0014-R028): a scoped billing designation
 * names its address, and `copy_all` reads "copy".
 * @param {{designation: string, addressId: string|null, copyAll: boolean}[]} designations
 * @param {object[]} [addresses] The organization's addresses.
 * @returns {string[]}
 */
export function describeDesignations(designations, addresses = []) {
  return designations.map(({ designation, addressId, copyAll }) => {
    const label = DESIGNATION_LABELS[designation];
    if (addressId)
      return `${label} (${addressName(addresses.find(a => a.id === addressId))})`;
    return copyAll ? `${label} (copy)` : label;
  });
}
