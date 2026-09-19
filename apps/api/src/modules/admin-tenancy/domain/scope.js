/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { AdminAccessError } from './errors.js';

/**
 * @typedef {object} AdminAccessScope
 * @property {boolean} platformPortalUserRead Permits reading a portal user's
 *   own record regardless of tenant membership, since a portal user is a
 *   platform record. When false, a portal-user target is permitted only
 *   through an active membership in a tenant this scope permits.
 * @property {'*'|string[]} tenantIds Tenants this scope may read; `'*'` for
 *   every tenant.
 * @property {string[]} deniedTenantIds Tenants explicitly excluded from
 *   `tenantIds`, applied to the requested tenant. Carries support's Napsoft
 *   restriction.
 * @property {boolean} archiveManagement Required to call an
 *   `IncludingArchived` method.
 */

const scopeSchema = z.strictObject({
  platformPortalUserRead: z.boolean(),
  tenantIds: z.union([z.literal('*'), z.array(z.uuid())]),
  deniedTenantIds: z.array(z.uuid()),
  archiveManagement: z.boolean(),
});

/**
 * Validate a caller-supplied authorization scope.
 * @param {unknown} scope
 * @returns {AdminAccessScope}
 * @throws {AdminAccessError} `INVALID_INPUT`
 */
export function parseScope(scope) {
  const result = scopeSchema.safeParse(scope);
  if (!result.success) throw new AdminAccessError('INVALID_INPUT');
  return result.data;
}

/**
 * Whether `scope` permits reading the given tenant: named or covered by
 * `'*'`, and not explicitly denied.
 * @param {AdminAccessScope} scope
 * @param {string} tenantId
 * @returns {boolean}
 */
export function isTenantPermitted(scope, tenantId) {
  if (scope.deniedTenantIds.includes(tenantId)) return false;
  return scope.tenantIds === '*' || scope.tenantIds.includes(tenantId);
}

/**
 * Require archive-management authority.
 * @param {AdminAccessScope} scope
 * @returns {void}
 * @throws {AdminAccessError} `FORBIDDEN`
 */
export function requireArchiveManagement(scope) {
  if (!scope.archiveManagement) throw new AdminAccessError('FORBIDDEN');
}
