/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The `Directory` navigation group's data (module map §
 * Directory). Each child is one kind of business-directory record
 * for the selected tenant (M0005-R026); it is visible only when the
 * session's resolved capabilities match its route capability (I0005-R011).
 */

import { can } from '../auth/capabilities.js';

export const DIRECTORY_CHILDREN = Object.freeze([
  Object.freeze({
    id: 'employees',
    label: 'Employees',
    path: '/directory/employees',
    capability: 'business-directory::directory::read',
  }),
  Object.freeze({
    id: 'contacts',
    label: 'Contacts',
    path: '/directory/contacts',
    capability: 'business-directory::directory::read',
  }),
  Object.freeze({
    id: 'vendors',
    label: 'Vendors',
    path: '/directory/vendors',
    capability: 'business-directory::directory::read',
  }),
  Object.freeze({
    id: 'clients',
    label: 'Clients',
    path: '/directory/clients',
    capability: 'business-directory::directory::read',
  }),
]);

/**
 * The `Directory` children visible for the session's capabilities.
 * @param {object|null} capabilities `GET /session/capabilities` data.
 * @returns {Array<{id: string, label: string, path: string}>}
 */
export function visibleDirectoryChildren(capabilities) {
  return DIRECTORY_CHILDREN.filter(child =>
    can(capabilities, child.capability, 'session')
  ).map(({ id, label, path }) => ({ id, label, path }));
}
