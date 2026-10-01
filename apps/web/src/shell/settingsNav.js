/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The `Settings` navigation group's data: the selected tenant's roles
 * (M0003-R016) and its labels (M0005-R017). A child is visible only when the session's resolved
 * capabilities match its route capability in the selected tenant
 * (I0005-R011).
 */

import { can } from '../auth/capabilities.js';

export const SETTINGS_CHILDREN = Object.freeze([
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
]);

/**
 * The `Settings` children visible for the session's capabilities.
 * @param {object|null} capabilities `GET /session/capabilities` data.
 * @returns {Array<{id: string, label: string, path: string}>}
 */
export function visibleSettingsChildren(capabilities) {
  return SETTINGS_CHILDREN.filter(child =>
    can(capabilities, child.capability, 'session')
  ).map(({ id, label, path }) => ({ id, label, path }));
}
