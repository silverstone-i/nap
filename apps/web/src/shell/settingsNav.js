/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The `Settings` navigation group's data: the selected tenant's general
 * settings (M0006-01-R010), a customer tenant's company profile (I0013-R026), file storage (M0006-02-R015), roles (M0003-R016), labels (M0005-R017), and tax
 * ID formats (M0005-R042). A child is visible only when the session's
 * resolved capabilities match its route capability in the selected tenant
 * (I0005-R011).
 */

import { can } from '../auth/capabilities.js';

export const SETTINGS_CHILDREN = Object.freeze([
  Object.freeze({
    id: 'general',
    label: 'General',
    path: '/settings/general',
    capability: 'tenant-settings::general::read',
  }),
  Object.freeze({
    id: 'company',
    label: 'Company',
    path: '/settings/company',
    capability: 'business-directory::directory::read',
    // Napsoft has no company profile of its own.
    customerOnly: true,
  }),
  Object.freeze({
    id: 'storage',
    label: 'Storage',
    path: '/settings/storage',
    capability: 'tenant-settings::storage::read',
  }),
  Object.freeze({
    id: 'roles',
    label: 'Roles',
    path: '/settings/roles',
    capability: 'access-control::roles::read',
  }),
  Object.freeze({
    id: 'labels',
    label: 'Labels',
    path: '/settings/labels',
    capability: 'business-directory::directory::read',
  }),
  Object.freeze({
    id: 'tax-id-formats',
    label: 'Tax ID Formats',
    path: '/settings/tax-id-formats',
    capability: 'business-directory::directory::read',
  }),
]);

/**
 * The `Settings` children visible for the session's capabilities.
 * @param {object|null} capabilities `GET /session/capabilities` data.
 * @returns {Array<{id: string, label: string, path: string}>}
 */
export function visibleSettingsChildren(capabilities) {
  const customer =
    capabilities?.targetTenant != null &&
    capabilities.targetTenant.code !== capabilities.napsoftTenant?.code;
  return SETTINGS_CHILDREN.filter(
    child =>
      can(capabilities, child.capability, 'session') &&
      (!child.customerOnly || customer)
  ).map(({ id, label, path }) => ({ id, label, path }));
}
