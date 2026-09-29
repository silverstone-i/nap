/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The `Organization Setup` navigation group's data (module map §
 * Organization Setup). Each child is a business-directory screen for the
 * selected tenant (M0005-R026); it is visible only when the session's
 * resolved capabilities match its route capability (I0005-R011).
 */

import { can } from '../auth/capabilities.js';

export const ORGANIZATION_SETUP_CHILDREN = Object.freeze([
  Object.freeze({
    id: 'people',
    label: 'People',
    path: '/directory/people',
    capability: 'business-directory::directory::read',
  }),
  Object.freeze({
    id: 'organizations',
    label: 'Vendors & Clients',
    path: '/directory/organizations',
    capability: 'business-directory::directory::read',
  }),
  Object.freeze({
    id: 'tenant-contacts',
    label: 'Tenant Contacts',
    path: '/directory/tenant-contacts',
    capability: 'business-directory::directory::read',
  }),
  Object.freeze({
    id: 'labels',
    label: 'Labels',
    path: '/directory/labels',
    capability: 'business-directory::directory::read',
  }),
]);

/**
 * The `Organization Setup` children visible for the session's capabilities.
 * @param {object|null} capabilities `GET /session/capabilities` data.
 * @returns {Array<{id: string, label: string, path: string}>}
 */
export function visibleOrganizationSetupChildren(capabilities) {
  return ORGANIZATION_SETUP_CHILDREN.filter(child =>
    can(capabilities, child.capability, 'session')
  ).map(({ id, label, path }) => ({ id, label, path }));
}
