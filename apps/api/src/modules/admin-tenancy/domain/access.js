/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { AdminAccessError, withDatabaseErrors } from './errors.js';
import {
  parseScope,
  isTenantPermitted,
  requireArchiveManagement,
} from './scope.js';
import { parseUuid, parseLimit } from './validation.js';
import { parseCursor, encodeCursor } from './cursor.js';

/** Safe projection of `admin.tenants`: no column on this table is secret. */
export const TENANT_VIEW_COLUMNS = [
  'id',
  'tenant_code',
  'name',
  'tier',
  'status',
  'is_napsoft',
  'cell_id',
  'provisioned',
  'rbac_ready',
  'revision',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'deactivated_at',
];

/** Safe projection of `admin.portal_users`: omits `password_hash` and `must_change_password`. */
export const PORTAL_USER_VIEW_COLUMNS = [
  'id',
  'email',
  'status',
  'is_root',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'deactivated_at',
];

/** Safe projection of `admin.portal_user_tenants`: no column on this table is secret. */
export const MEMBERSHIP_VIEW_COLUMNS = [
  'id',
  'portal_user_id',
  'tenant_id',
  'member_type',
  'status',
  'member_id',
  'ready',
  'revision',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'deactivated_at',
];

/**
 * @typedef {object} AdminTenancyDb
 * @property {import('../models/tenants.js').Tenants} tenants
 * @property {import('../models/portal_users.js').PortalUsers} portal_users
 * @property {import('../models/portal_user_tenants.js').PortalUserTenants} portal_user_tenants
 */

/**
 * Whether the portal user has an active membership in a tenant `scope`
 * permits. Used to authorize a portal-user target for a scope without
 * platform-level portal-user read authority.
 * @param {AdminTenancyDb} db
 * @param {import('./scope.js').AdminAccessScope} scope
 * @param {string} portalUserId
 * @returns {Promise<boolean>}
 */
async function hasPermittedActiveMembership(db, scope, portalUserId) {
  const memberships = await db.portal_user_tenants.findWhere(
    { portal_user_id: portalUserId, status: 'active' },
    'AND',
    { columnWhitelist: ['tenant_id'] }
  );
  return memberships.some(m => isTenantPermitted(scope, m.tenant_id));
}

/**
 * Require that `scope` may read the given portal user: platform-level
 * portal-user read authority, or an active membership in a permitted tenant.
 * @param {AdminTenancyDb} db
 * @param {import('./scope.js').AdminAccessScope} scope
 * @param {string} portalUserId
 * @returns {Promise<void>}
 * @throws {AdminAccessError} `FORBIDDEN`
 */
async function requirePortalUserTarget(db, scope, portalUserId) {
  if (scope.platformPortalUserRead) return;
  if (!(await hasPermittedActiveMembership(db, scope, portalUserId)))
    throw new AdminAccessError('FORBIDDEN');
}

/**
 * Build the tenant portion of a membership-list filter from an authorized
 * scope. An empty array means the scope permits no tenant memberships.
 * @param {import('./scope.js').AdminAccessScope} scope
 * @returns {object|null}
 */
function membershipTenantFilter(scope) {
  if (scope.tenantIds !== '*') {
    const permitted = scope.tenantIds.filter(
      id => !scope.deniedTenantIds.includes(id)
    );
    return permitted.length ? { tenant_id: { $in: permitted } } : null;
  }
  if (scope.deniedTenantIds.length)
    return {
      $and: scope.deniedTenantIds.map(id => ({ tenant_id: { $ne: id } })),
    };
  return {};
}

/**
 * Find an active tenant by UUID.
 * @param {AdminTenancyDb} db
 * @param {unknown} scope
 * @param {unknown} tenantId
 * @returns {Promise<object|null>} Safe tenant view, or `null` if missing or archived.
 * @throws {AdminAccessError} `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`
 */
export async function findTenant(db, scope, tenantId) {
  const parsedScope = parseScope(scope);
  const id = parseUuid(tenantId);
  return withDatabaseErrors(async () => {
    if (!isTenantPermitted(parsedScope, id))
      throw new AdminAccessError('FORBIDDEN');
    const row = await db.tenants.findOneBy(
      { id },
      { columnWhitelist: TENANT_VIEW_COLUMNS }
    );
    return row ?? null;
  });
}

/**
 * Find a tenant by UUID, including an archived tenant.
 * @param {AdminTenancyDb} db
 * @param {unknown} scope
 * @param {unknown} tenantId
 * @returns {Promise<object|null>} Safe tenant view, or `null` if missing.
 * @throws {AdminAccessError} `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`
 */
export async function findTenantIncludingArchived(db, scope, tenantId) {
  const parsedScope = parseScope(scope);
  const id = parseUuid(tenantId);
  return withDatabaseErrors(async () => {
    requireArchiveManagement(parsedScope);
    if (!isTenantPermitted(parsedScope, id))
      throw new AdminAccessError('FORBIDDEN');
    const row = await db.tenants.findOneBy(
      { id },
      { columnWhitelist: TENANT_VIEW_COLUMNS, includeDeactivated: true }
    );
    return row ?? null;
  });
}

/**
 * Find an active portal user by UUID.
 * @param {AdminTenancyDb} db
 * @param {unknown} scope
 * @param {unknown} portalUserId
 * @returns {Promise<object|null>} Safe portal-user view, or `null` if missing or archived.
 * @throws {AdminAccessError} `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`
 */
export async function findPortalUser(db, scope, portalUserId) {
  const parsedScope = parseScope(scope);
  const id = parseUuid(portalUserId);
  return withDatabaseErrors(async () => {
    await requirePortalUserTarget(db, parsedScope, id);
    const row = await db.portal_users.findOneBy(
      { id },
      { columnWhitelist: PORTAL_USER_VIEW_COLUMNS }
    );
    return row ?? null;
  });
}

/**
 * Find a portal user by UUID, including an archived portal user.
 * @param {AdminTenancyDb} db
 * @param {unknown} scope
 * @param {unknown} portalUserId
 * @returns {Promise<object|null>} Safe portal-user view, or `null` if missing.
 * @throws {AdminAccessError} `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`
 */
export async function findPortalUserIncludingArchived(db, scope, portalUserId) {
  const parsedScope = parseScope(scope);
  const id = parseUuid(portalUserId);
  return withDatabaseErrors(async () => {
    requireArchiveManagement(parsedScope);
    await requirePortalUserTarget(db, parsedScope, id);
    const row = await db.portal_users.findOneBy(
      { id },
      { columnWhitelist: PORTAL_USER_VIEW_COLUMNS, includeDeactivated: true }
    );
    return row ?? null;
  });
}

/**
 * List a portal user's active permitted tenant memberships in stable UUID
 * order, paginated by opaque cursor.
 * @param {AdminTenancyDb} db
 * @param {unknown} scope
 * @param {unknown} portalUserId
 * @param {{cursor?: unknown, limit?: unknown}} [page]
 * @returns {Promise<{rows: object[], nextCursor: string|null}>} A page of safe membership views.
 * @throws {AdminAccessError} `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`
 */
export async function listMembershipsByUser(
  db,
  scope,
  portalUserId,
  { cursor, limit } = {}
) {
  const parsedScope = parseScope(scope);
  const id = parseUuid(portalUserId);
  const parsedLimit = parseLimit(limit);
  const resumeFrom = parseCursor(cursor, 'listMembershipsByUser', id);
  return withDatabaseErrors(async () => {
    await requirePortalUserTarget(db, parsedScope, id);
    const tenantFilter = membershipTenantFilter(parsedScope);
    if (!tenantFilter) return { rows: [], nextCursor: null };
    const page = await db.portal_user_tenants.findAfterCursor(
      resumeFrom ?? {},
      parsedLimit,
      ['id'],
      {
        columnWhitelist: MEMBERSHIP_VIEW_COLUMNS,
        filters: { portal_user_id: id, ...tenantFilter },
      }
    );
    return {
      rows: page.rows,
      nextCursor: encodeCursor(page.nextCursor, 'listMembershipsByUser', id),
    };
  });
}

/**
 * List a tenant's active memberships, stably paginated by opaque cursor.
 * @param {AdminTenancyDb} db
 * @param {unknown} scope
 * @param {unknown} tenantId
 * @param {{cursor?: unknown, limit?: unknown}} [page]
 * @returns {Promise<{rows: object[], nextCursor: string|null}>} A page of safe membership views.
 * @throws {AdminAccessError} `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`
 */
export async function listMembershipsByTenant(
  db,
  scope,
  tenantId,
  { cursor, limit } = {}
) {
  const parsedScope = parseScope(scope);
  const id = parseUuid(tenantId);
  const parsedLimit = parseLimit(limit);
  const resumeFrom = parseCursor(cursor, 'listMembershipsByTenant', id);
  return withDatabaseErrors(async () => {
    if (!isTenantPermitted(parsedScope, id))
      throw new AdminAccessError('FORBIDDEN');
    const page = await db.portal_user_tenants.findAfterCursor(
      resumeFrom ?? {},
      parsedLimit,
      ['id'],
      {
        columnWhitelist: MEMBERSHIP_VIEW_COLUMNS,
        filters: { tenant_id: id },
      }
    );
    return {
      rows: page.rows,
      nextCursor: encodeCursor(page.nextCursor, 'listMembershipsByTenant', id),
    };
  });
}
