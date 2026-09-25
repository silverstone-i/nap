/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file One function per API contract I0001 consumes (PRD §10). Every
 * response is validated against the shared transport schema before it
 * reaches application state.
 */

import {
  accessContextResponseSchema,
  controlOverviewResponseSchema,
  eligibleTenantsResponseSchema,
  sessionResponseSchema,
  tenantResponseSchema,
  tenantsListResponseSchema,
  userResponseSchema,
  usersListResponseSchema,
} from '@nap/shared';
import { apiDelete, apiGet, apiPost } from './client.js';

const BASE = '/api/admin-tenancy/v1';

/** Build a same-origin query string from a `{cursor, limit}` page request, omitting unset values. */
function pageQuery({ cursor, limit } = {}) {
  const params = new URLSearchParams();
  if (cursor !== undefined && cursor !== null) params.set('cursor', cursor);
  if (limit !== undefined && limit !== null) params.set('limit', String(limit));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>} Safe session view.
 */
export async function login(email, password) {
  const data = await apiPost(`${BASE}/auth/login`, { email, password });
  return sessionResponseSchema.parse({ version: 1, data }).data;
}

/**
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<object>} Safe session view.
 */
export async function changePassword(currentPassword, newPassword) {
  const data = await apiPost(`${BASE}/auth/password`, {
    currentPassword,
    newPassword,
  });
  return sessionResponseSchema.parse({ version: 1, data }).data;
}

/** @returns {Promise<void>} */
export async function logout() {
  await apiPost(`${BASE}/auth/logout`);
}

/** @returns {Promise<object>} The browser startup context (I0001-R022). */
export async function getAccessContext() {
  const data = await apiGet(`${BASE}/access/context`);
  return accessContextResponseSchema.parse({ version: 1, data }).data;
}

/** @returns {Promise<object[]>} The caller's eligible tenants. */
export async function listTenants() {
  const data = await apiGet(`${BASE}/access/tenants`);
  return eligibleTenantsResponseSchema.parse({ version: 1, data }).data;
}

/**
 * @param {string} tenantId
 * @returns {Promise<object>} Safe session view with `tenant` set.
 */
export async function selectTenant(tenantId) {
  const data = await apiPost(`${BASE}/access/select`, { tenant: tenantId });
  return sessionResponseSchema.parse({ version: 1, data }).data;
}

// ---------------------------------------------------------------------------
// Platform administration (I0002)
// ---------------------------------------------------------------------------

/**
 * @param {{cursor?: string, limit?: number}} [page]
 * @returns {Promise<{rows: object[], nextCursor: string|null}>} A page of safe tenant views (I0002-R007).
 */
export async function listTenantsPage(page) {
  const data = await apiGet(`${BASE}/tenants${pageQuery(page)}`);
  return tenantsListResponseSchema.parse({ version: 1, data }).data;
}

/**
 * @param {{code: string, name: string, tier: string}} input
 * @returns {Promise<object>} Safe tenant view (I0002-R002).
 */
export async function createTenant(input) {
  const data = await apiPost(`${BASE}/tenants`, input, {
    'Idempotency-Key': crypto.randomUUID(),
  });
  return tenantResponseSchema.parse({ version: 1, data }).data;
}

/**
 * @param {{cursor?: string, limit?: number}} [page]
 * @returns {Promise<{rows: object[], nextCursor: string|null}>} A page of `{cell, operation}` overview rows.
 */
export async function listCellsOverview(page) {
  const data = await apiGet(`${BASE}/control/overview${pageQuery(page)}`);
  return controlOverviewResponseSchema.parse({ version: 1, data }).data;
}

/**
 * @param {{suffix: string}} input
 * @returns {Promise<object>} `{cell, operation}` UUIDs for the new registration.
 */
export async function registerCell({ suffix }) {
  return apiPost(`${BASE}/control/registry`, { operation: 'cell', suffix });
}

/**
 * @param {{cell: string}} input Cell UUID.
 * @returns {Promise<object>} The current queued provisioning operation.
 */
export async function retryCellProvisioning({ cell }) {
  return apiPost(`${BASE}/control/provision`, {
    operation: 'cell-retry',
    cell,
  });
}

/**
 * @param {{cell: string}} input Cell UUID.
 * @returns {Promise<object>} The disabled registry view.
 */
export async function disableCell({ cell }) {
  return apiPost(`${BASE}/control/provision`, {
    operation: 'cell-disable',
    cell,
  });
}

/**
 * I0003-R027: queue re-activation of a disabled, fully provisioned cell.
 * @param {{cell: string}} input Cell UUID.
 * @returns {Promise<object>} The queued activation operation.
 */
export async function activateCell({ cell }) {
  return apiPost(`${BASE}/control/provision`, {
    operation: 'cell-activate',
    cell,
  });
}

/**
 * @param {{cursor?: string, limit?: number}} [page]
 * @returns {Promise<{rows: object[], nextCursor: string|null}>} A page of safe portal-user views (I0002-R008).
 */
export async function listUsersPage(page) {
  const data = await apiGet(`${BASE}/accounts/users${pageQuery(page)}`);
  return usersListResponseSchema.parse({ version: 1, data }).data;
}

/**
 * @param {{email: string, password: string}} input
 * @returns {Promise<object>} Safe user view (I0002-R006).
 */
export async function createPortalUser(input) {
  const data = await apiPost(`${BASE}/accounts/users`, input, {
    'Idempotency-Key': crypto.randomUUID(),
  });
  return userResponseSchema.parse({ version: 1, data }).data;
}

/**
 * @param {string} id Portal-user UUID.
 * @returns {Promise<void>}
 */
export async function deactivatePortalUser(id) {
  await apiDelete(`${BASE}/accounts/users/${id}`);
}

/**
 * @param {string} id Portal-user UUID.
 * @returns {Promise<object>} Safe user view.
 */
export async function restorePortalUser(id) {
  const data = await apiPost(`${BASE}/accounts/users/${id}/restore`);
  return userResponseSchema.parse({ version: 1, data }).data;
}
