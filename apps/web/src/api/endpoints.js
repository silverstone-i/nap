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
  capabilityEntrySchema,
  controlOverviewResponseSchema,
  referenceRolloutSchema,
  countrySchema,
  currencySchema,
  eligibleTenantsResponseSchema,
  roleViewSchema,
  sessionCapabilitiesSchema,
  sessionResponseSchema,
  tenantResponseSchema,
  tenantsListResponseSchema,
  userRolesSchema,
  userResponseSchema,
  usersListResponseSchema,
  personViewSchema,
  personDetailSchema,
  organizationViewSchema,
  organizationDetailSchema,
  organizationContactViewSchema,
  organizationContactDetailSchema,
  contactMethodViewSchema,
  addressViewSchema,
  contactLabelViewSchema,
  tenantContactViewSchema,
} from '@nap/shared';
import { z } from 'zod';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client.js';

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

/** @returns {Promise<object>} The session's resolved capabilities (I0005-R010). */
export async function getSessionCapabilities() {
  const data = await apiGet(`${BASE}/session/capabilities`);
  return sessionCapabilitiesSchema.parse(data);
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
 * @returns {Promise<{rows: object[], nextCursor: string|null, anyActive: boolean}>} A page of safe tenant views with their provisioning jobs (I0002-R007, I0006-R011).
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
 * I0006-R001: queue a tenant's provisioning into a ready cell with its first
 * administrator. The name becomes their employee record (M0005-R021).
 * @param {{tenant: string, cell: string, firstName: string, lastName: string, email: string, password: string}} input
 * @returns {Promise<object>} The queued tenant job.
 */
export async function provisionTenant({
  tenant,
  cell,
  firstName,
  lastName,
  email,
  password,
}) {
  return apiPost(
    `${BASE}/control/provision`,
    {
      operation: 'tenant-provision',
      tenant,
      cell,
      admin: { email, password, firstName, lastName },
    },
    { 'Idempotency-Key': crypto.randomUUID() }
  );
}

/**
 * I0006-R004: requeue a failed tenant job at the stage that failed.
 * @param {{tenant: string}} input Tenant UUID.
 * @returns {Promise<object>} The queued tenant job.
 */
export async function retryTenantProvisioning({ tenant }) {
  return apiPost(`${BASE}/control/provision`, {
    operation: 'tenant-retry',
    tenant,
  });
}

/**
 * @param {{cursor?: string, limit?: number}} [page]
 * @returns {Promise<{rows: object[], nextCursor: string|null}>} A page of `{cell, operation, ready}` overview rows.
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
 * I0007-R006: queue a load of the declared reference seed into one cell.
 * @param {{cell: string}} input Cell UUID.
 * @returns {Promise<object>} The queued seed operation.
 */
export async function seedCell({ cell }) {
  return apiPost(`${BASE}/control/provision`, {
    operation: 'cell-seed',
    cell,
  });
}

/**
 * I0007-R007: queue a seed job for every cell missing the declared version.
 * @returns {Promise<{declaredVersion: number|null, queued: string[], skipped: {cell: string, reason: string}[]}>}
 */
export async function rolloutReferenceData() {
  const data = await apiPost(`${BASE}/control/provision`, {
    operation: 'reference-rollout',
  });
  return referenceRolloutSchema.parse(data);
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

// ---------------------------------------------------------------------------
// Access control: roles and assignments (M0003-R016, M0003 §10)
// ---------------------------------------------------------------------------

const ACCESS_BASE = '/api/access-control/v1';

/**
 * @typedef {object} RoleView
 * @property {string} id
 * @property {string} code
 * @property {string} name
 * @property {string|null} description
 * @property {boolean} isImmutable
 * @property {boolean} archived
 * @property {number} revision
 * @property {string[]} grants 4-part patterns, e.g. `ACME::access-control::roles::read`.
 */

/** @returns {Promise<Array<{capability: string, module: string, router: string, action: string}>>} The capability catalogue, sorted. */
export async function listCapabilities() {
  return z
    .array(capabilityEntrySchema)
    .parse(await apiGet(`${ACCESS_BASE}/capabilities`));
}

/**
 * @param {{includeArchived?: boolean}} [options]
 * @returns {Promise<RoleView[]>} Roles in the session's selected tenant.
 */
export async function listRoles({ includeArchived = false } = {}) {
  const query = includeArchived ? '?includeArchived=true' : '';
  return z
    .array(roleViewSchema)
    .parse(await apiGet(`${ACCESS_BASE}/roles${query}`));
}

/** @param {string} id @returns {Promise<RoleView>} */
export async function getRole(id) {
  return roleViewSchema.parse(await apiGet(`${ACCESS_BASE}/roles/${id}`));
}

/**
 * @param {{code: string, name: string, description?: string, grants: string[]}} input
 * @returns {Promise<RoleView>}
 */
export async function createRole(input) {
  return roleViewSchema.parse(await apiPost(`${ACCESS_BASE}/roles`, input));
}

/**
 * `grants`, when present, replaces the full set.
 * @param {string} id
 * @param {{name?: string, description?: string, grants?: string[], revision: number}} input
 * @returns {Promise<RoleView>}
 */
export async function updateRole(id, input) {
  return roleViewSchema.parse(
    await apiPatch(`${ACCESS_BASE}/roles/${id}`, input)
  );
}

/** @param {string} id @param {number} revision @returns {Promise<RoleView>} */
export async function archiveRole(id, revision) {
  return roleViewSchema.parse(
    await apiPost(`${ACCESS_BASE}/roles/${id}/archive`, { revision })
  );
}

/** @param {string} id @param {number} revision @returns {Promise<RoleView>} */
export async function restoreRole(id, revision) {
  return roleViewSchema.parse(
    await apiPost(`${ACCESS_BASE}/roles/${id}/restore`, { revision })
  );
}

/** @param {string} userId @returns {Promise<{userId: string, roles: RoleView[]}>} Active assignments only. */
export async function getUserRoles(userId) {
  return userRolesSchema.parse(
    await apiGet(`${ACCESS_BASE}/users/${userId}/roles`)
  );
}

/** @param {string} userId @param {string} roleId @returns {Promise<{userId: string, roles: RoleView[]}>} */
export async function assignUserRole(userId, roleId) {
  return userRolesSchema.parse(
    await apiPut(`${ACCESS_BASE}/users/${userId}/roles/${roleId}`, {})
  );
}

/** @param {string} userId @param {string} roleId @returns {Promise<{userId: string, roles: RoleView[]}>} */
export async function removeUserRole(userId, roleId) {
  return userRolesSchema.parse(
    await apiDelete(`${ACCESS_BASE}/users/${userId}/roles/${roleId}`)
  );
}

const REFERENCE_BASE = '/api/reference-data/v1';
/** @type {Map<string, Promise<object[]>>} */
const lookups = new Map();

/**
 * Load a lookup list once and share it for the rest of the page session
 * (M0004-R009). A failed load is forgotten so the next call retries.
 * @param {'countries'|'currencies'} list
 * @param {import('zod').ZodTypeAny} schema
 * @returns {Promise<object[]>}
 */
function cachedLookup(list, schema) {
  if (!lookups.has(list))
    lookups.set(
      list,
      apiGet(`${REFERENCE_BASE}/${list}`)
        .then(data => z.array(schema).parse(data))
        .catch(error => {
          lookups.delete(list);
          throw error;
        })
    );
  return lookups.get(list);
}

/** @returns {Promise<{code: string, alpha3: string, numericCode: string, name: string}[]>} */
export function listCountries() {
  return cachedLookup('countries', countrySchema);
}

/** @returns {Promise<{code: string, numericCode: string, name: string, minorUnit: number}[]>} */
export function listCurrencies() {
  return cachedLookup('currencies', currencySchema);
}

/** Forget cached lookup lists; for tests. */
export function clearLookups() {
  lookups.clear();
}

// ---------------------------------------------------------------------------
// Business directory (M0005 §10). Every call is scoped server-side to the
// session's selected tenant.
// ---------------------------------------------------------------------------

const DIRECTORY_BASE = '/api/business-directory/v1';

/** View and detail schemas for each record collection. */
const COLLECTION_SCHEMAS = {
  people: { view: personViewSchema, detail: personDetailSchema },
  organizations: {
    view: organizationViewSchema,
    detail: organizationDetailSchema,
  },
  'organization-contacts': {
    view: organizationContactViewSchema,
    detail: organizationContactDetailSchema,
  },
};

/**
 * @param {'people'|'organizations'|'organization-contacts'} collection
 * @param {{kind?: string, q?: string, taxId?: string, organizationId?: string, includeArchived?: boolean}} [filters]
 * @returns {Promise<object[]>} Matching records; tax IDs masked.
 */
export async function listDirectoryRecords(collection, filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (
      value !== undefined &&
      value !== null &&
      value !== '' &&
      value !== false
    )
      params.set(key, String(value));
  const query = params.toString();
  return z
    .array(COLLECTION_SCHEMAS[collection].view)
    .parse(
      await apiGet(`${DIRECTORY_BASE}/${collection}${query ? `?${query}` : ''}`)
    );
}

/**
 * @param {'people'|'organizations'|'organization-contacts'} collection
 * @param {string} id
 * @returns {Promise<object>} The record with its emails, phones, and addresses.
 */
export async function getDirectoryRecord(collection, id) {
  return COLLECTION_SCHEMAS[collection].detail.parse(
    await apiGet(`${DIRECTORY_BASE}/${collection}/${id}`)
  );
}

/**
 * @param {'people'|'organizations'|'organization-contacts'} collection
 * @param {object} input
 * @returns {Promise<object>} The created record, with `duplicateTaxIds` when a tax ID was saved.
 */
export async function createDirectoryRecord(collection, input) {
  return COLLECTION_SCHEMAS[collection].view.parse(
    await apiPost(`${DIRECTORY_BASE}/${collection}`, input)
  );
}

/**
 * @param {'people'|'organizations'|'organization-contacts'} collection
 * @param {string} id
 * @param {object} input Changed fields and the expected `revision`.
 * @returns {Promise<object>}
 */
export async function updateDirectoryRecord(collection, id, input) {
  return COLLECTION_SCHEMAS[collection].view.parse(
    await apiPatch(`${DIRECTORY_BASE}/${collection}/${id}`, input)
  );
}

/**
 * @param {'people'|'organizations'|'organization-contacts'} collection
 * @param {string} id
 * @param {number} revision
 * @returns {Promise<object>}
 */
export async function archiveDirectoryRecord(collection, id, revision) {
  return COLLECTION_SCHEMAS[collection].view.parse(
    await apiPost(`${DIRECTORY_BASE}/${collection}/${id}/archive`, {
      revision,
    })
  );
}

/**
 * @param {'people'|'organizations'|'organization-contacts'} collection
 * @param {string} id
 * @param {number} revision
 * @returns {Promise<object>}
 */
export async function restoreDirectoryRecord(collection, id, revision) {
  return COLLECTION_SCHEMAS[collection].view.parse(
    await apiPost(`${DIRECTORY_BASE}/${collection}/${id}/restore`, {
      revision,
    })
  );
}

/**
 * Reveal a full tax ID; the server records who read it (M0005-R012).
 * @param {'people'|'organizations'|'organization-contacts'} collection
 * @param {string} id
 * @returns {Promise<string>} Nine digits.
 */
export async function revealTaxId(collection, id) {
  return z
    .strictObject({ taxId: z.string().regex(/^[0-9]{9}$/) })
    .parse(await apiGet(`${DIRECTORY_BASE}/${collection}/${id}/tax-id`)).taxId;
}

/**
 * @param {string} partyId
 * @param {{type: 'email'|'phone', value: string, labelId?: string|null, isPrimary?: boolean}} input
 * @returns {Promise<object>}
 */
export async function addContactMethod(partyId, input) {
  return contactMethodViewSchema.parse(
    await apiPost(`${DIRECTORY_BASE}/parties/${partyId}/contact-methods`, input)
  );
}

/**
 * @param {string} partyId
 * @param {string} id
 * @param {object} input Changed fields and the expected `revision`.
 * @returns {Promise<object>}
 */
export async function updateContactMethod(partyId, id, input) {
  return contactMethodViewSchema.parse(
    await apiPatch(
      `${DIRECTORY_BASE}/parties/${partyId}/contact-methods/${id}`,
      input
    )
  );
}

/**
 * @param {string} partyId
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function removeContactMethod(partyId, id) {
  return contactMethodViewSchema.parse(
    await apiDelete(
      `${DIRECTORY_BASE}/parties/${partyId}/contact-methods/${id}`
    )
  );
}

/**
 * @param {string} partyId
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function addAddress(partyId, input) {
  return addressViewSchema.parse(
    await apiPost(`${DIRECTORY_BASE}/parties/${partyId}/addresses`, input)
  );
}

/**
 * @param {string} partyId
 * @param {string} id
 * @param {object} input Changed fields and the expected `revision`.
 * @returns {Promise<object>}
 */
export async function updateAddress(partyId, id, input) {
  return addressViewSchema.parse(
    await apiPatch(
      `${DIRECTORY_BASE}/parties/${partyId}/addresses/${id}`,
      input
    )
  );
}

/**
 * @param {string} partyId
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function removeAddress(partyId, id) {
  return addressViewSchema.parse(
    await apiDelete(`${DIRECTORY_BASE}/parties/${partyId}/addresses/${id}`)
  );
}

/**
 * @param {{appliesTo?: 'email'|'phone'|'address', includeArchived?: boolean}} [filters]
 * @returns {Promise<object[]>}
 */
export async function listContactLabels({ appliesTo, includeArchived } = {}) {
  const params = new URLSearchParams();
  if (appliesTo) params.set('appliesTo', appliesTo);
  if (includeArchived) params.set('includeArchived', 'true');
  const query = params.toString();
  return z
    .array(contactLabelViewSchema)
    .parse(await apiGet(`${DIRECTORY_BASE}/labels${query ? `?${query}` : ''}`));
}

/**
 * @param {{appliesTo: 'email'|'phone'|'address', name: string}} input
 * @returns {Promise<object>}
 */
export async function createContactLabel(input) {
  return contactLabelViewSchema.parse(
    await apiPost(`${DIRECTORY_BASE}/labels`, input)
  );
}

/**
 * @param {string} id
 * @param {{name: string, revision: number}} input
 * @returns {Promise<object>}
 */
export async function renameContactLabel(id, input) {
  return contactLabelViewSchema.parse(
    await apiPatch(`${DIRECTORY_BASE}/labels/${id}`, input)
  );
}

/**
 * @param {string} id
 * @param {number} revision
 * @returns {Promise<object>}
 */
export async function archiveContactLabel(id, revision) {
  return contactLabelViewSchema.parse(
    await apiPost(`${DIRECTORY_BASE}/labels/${id}/archive`, { revision })
  );
}

/**
 * @param {string} id
 * @param {number} revision
 * @returns {Promise<object>}
 */
export async function restoreContactLabel(id, revision) {
  return contactLabelViewSchema.parse(
    await apiPost(`${DIRECTORY_BASE}/labels/${id}/restore`, { revision })
  );
}

/** @returns {Promise<object[]>} The tenant's active primary and billing contacts. */
export async function listTenantContacts() {
  return z
    .array(tenantContactViewSchema)
    .parse(await apiGet(`${DIRECTORY_BASE}/tenant-contacts`));
}

/**
 * @param {string} partyId An active employee.
 * @param {'primary'|'billing'} designation
 * @returns {Promise<void>}
 */
export async function addTenantContact(partyId, designation) {
  await apiPut(`${DIRECTORY_BASE}/tenant-contacts/${partyId}/${designation}`);
}

/**
 * @param {string} partyId
 * @param {'primary'|'billing'} designation
 * @returns {Promise<void>}
 */
export async function removeTenantContact(partyId, designation) {
  await apiDelete(
    `${DIRECTORY_BASE}/tenant-contacts/${partyId}/${designation}`
  );
}
