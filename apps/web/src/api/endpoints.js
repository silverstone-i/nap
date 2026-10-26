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
  tenantsListResponseSchema,
  userMembershipsResponseSchema,
  userResponseSchema,
  usersListResponseSchema,
  sessionsListResponseSchema,
  personViewSchema,
  personDetailSchema,
  organizationViewSchema,
  organizationDetailSchema,
  organizationContactViewSchema,
  organizationContactDetailSchema,
  contactMethodViewSchema,
  addressViewSchema,
  contactLabelViewSchema,
  taxIdFormatViewSchema,
  generalSettingsViewSchema,
  effectiveSettingsSchema,
  fileLinkSchema,
  logoViewSchema,
  profileViewSchema,
  storageViewSchema,
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

/** @returns {Promise<object[]>} The caller's picker entries: one per membership (I0012-R008). */
export async function listTenants() {
  const data = await apiGet(`${BASE}/access/tenants`);
  return eligibleTenantsResponseSchema.parse({ version: 1, data }).data;
}

/**
 * @param {string} membershipId The picker entry's membership (I0012-R009).
 * @returns {Promise<object>} Safe session view with `tenant` and `membership` set.
 */
export async function selectTenant(membershipId) {
  const data = await apiPost(`${BASE}/access/select`, {
    membership: membershipId,
  });
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
 * I0006-R001: the tenants provisioned from one Napsoft client.
 * @param {string} clientId
 * @returns {Promise<object[]>} Safe tenant views with their provisioning jobs.
 */
export async function listClientTenants(clientId) {
  const data = await apiGet(
    `${BASE}/tenants?clientId=${encodeURIComponent(clientId)}`
  );
  return tenantsListResponseSchema.parse({ version: 1, data }).data.rows;
}

/**
 * I0006-R001: create a tenant from a Napsoft client and queue its
 * provisioning into a ready cell with its first administrator. The name
 * becomes their employee record (M0005-R021).
 * @param {{client: string, code: string, name: string, tier: string, cell: string, firstName: string, lastName: string, email: string, password: string}} input
 * @returns {Promise<object>} The queued tenant job.
 */
export async function provisionTenant({
  client,
  code,
  name,
  tier,
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
      client,
      code,
      name,
      tier,
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
 * @param {{cursor?: string, limit?: number, archived?: boolean, email?: string, tenantId?: string, status?: 'active'|'disabled', mustChangePassword?: 'true'|'false'}} [page]
 *   Only active users, or only deactivated ones with `archived` (I0011-R009);
 *   `email` keeps users whose email contains it (I0002-R015); `tenantId`,
 *   `status`, and `mustChangePassword` narrow the list further (I0002-R016).
 * @returns {Promise<{rows: object[], nextCursor: string|null}>} A page of safe portal-user views (I0002-R008).
 */
export async function listUsersPage({
  archived,
  email,
  tenantId,
  status,
  mustChangePassword,
  ...page
} = {}) {
  const params = new URLSearchParams(pageQuery(page));
  if (archived) params.set('archived', 'true');
  for (const [key, value] of Object.entries({
    email,
    tenantId,
    status,
    mustChangePassword,
  }))
    if (value) params.set(key, value);
  const query = params.toString();
  const data = await apiGet(
    `${BASE}/accounts/users${query ? `?${query}` : ''}`
  );
  return usersListResponseSchema.parse({ version: 1, data }).data;
}

/**
 * I0009-R001, R002: one page of sessions, active and ended.
 * @param {{cursor?: string, limit?: number, userId?: string, email?: string, tenantId?: string, from?: string, to?: string, status?: 'active'|'ended'}} [page]
 * @returns {Promise<{rows: object[], nextCursor: string|null}>}
 */
export async function listSessionsPage(page = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(page))
    if (value !== undefined && value !== null && value !== '')
      params.set(key, String(value));
  const query = params.toString();
  const data = await apiGet(`${BASE}/sessions${query ? `?${query}` : ''}`);
  return sessionsListResponseSchema.parse({ version: 1, data }).data;
}

/**
 * I0009-R009: revoke several sessions at once, all or nothing.
 * @param {string[]} ids Session UUIDs, 1 to 100.
 * @returns {Promise<void>}
 */
export async function revokeSessions(ids) {
  await apiPost(`${BASE}/sessions/revoke`, { ids });
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

/**
 * Deactivate or restore several portal users at once, all or nothing
 * (I0002-R013). A failure is `BULK_FAILED` with `details` naming each
 * failed user.
 * @param {'archive'|'restore'} action `archive` deactivates.
 * @param {string[]} ids Portal-user UUIDs.
 * @returns {Promise<void>}
 */
export async function bulkPortalUserAction(action, ids) {
  await apiPost(
    `${BASE}/accounts/users/${action === 'archive' ? 'deactivate' : 'restore'}`,
    { ids }
  );
}

/**
 * A login's memberships across tenants (I0008-R013).
 * @param {string} id Portal-user UUID.
 * @returns {Promise<object[]>} `{id, tenantId, tenantCode, tenantName, memberType, label, status}` rows.
 */
export async function listUserMemberships(id) {
  const data = await apiGet(`${BASE}/accounts/users/${id}/memberships`);
  return userMembershipsResponseSchema.parse({ version: 1, data }).data;
}

/**
 * Give a login a new temporary password (I0008-R014).
 * @param {string} id Portal-user UUID.
 * @param {string} temporaryPassword
 * @returns {Promise<object>} Safe user view.
 */
export async function resetUserPassword(id, temporaryPassword) {
  const data = await apiPost(`${BASE}/accounts/users/${id}/password-reset`, {
    temporaryPassword,
  });
  return userResponseSchema.parse({ version: 1, data }).data;
}

/**
 * Clear a login's sign-in throttle (I0008-R015).
 * @param {string} id Portal-user UUID.
 * @returns {Promise<object>} Safe user view.
 */
export async function unlockUser(id) {
  const data = await apiPost(`${BASE}/accounts/users/${id}/unlock`);
  return userResponseSchema.parse({ version: 1, data }).data;
}

/**
 * Disable or re-enable a login everywhere (I0008-R016).
 * @param {string} id Portal-user UUID.
 * @param {'active'|'disabled'} status
 * @returns {Promise<object>} Safe user view.
 */
export async function setUserStatus(id, status) {
  const data = await apiPatch(`${BASE}/accounts/users/${id}`, { status });
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
 * @param {{archived?: boolean}} [options] `archived` lists only archived roles (I0011-R009).
 * @returns {Promise<RoleView[]>} Active roles in the session's selected tenant, or its archived ones.
 */
export async function listRoles({ archived = false } = {}) {
  const query = archived ? '?archived=true' : '';
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

/**
 * Archive or restore several custom roles at once, all or nothing
 * (M0003-R018). A failure is `BULK_FAILED` with `details` naming each
 * failed role.
 * @param {'archive'|'restore'} action
 * @param {{id: string, revision: number}[]} items
 * @returns {Promise<RoleView[]>} The changed roles.
 */
export async function bulkRoleAction(action, items) {
  const data = await apiPost(`${ACCESS_BASE}/roles/${action}`, { items });
  return z.strictObject({ rows: z.array(roleViewSchema) }).parse(data).rows;
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
 * One page of a directory list (M0005-R027).
 * @param {'people'|'organizations'|'organization-contacts'} collection
 * @param {{cursor?: string, limit?: number, kind?: string, q?: string, taxId?: string, organizationId?: string, archived?: boolean}} [page]
 *   `archived` lists only archived records (I0011-R009).
 * @returns {Promise<{rows: object[], nextCursor: string|null}>} Tax IDs masked.
 */
export async function listDirectoryPage(collection, page = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(page))
    if (
      value !== undefined &&
      value !== null &&
      value !== '' &&
      value !== false
    )
      params.set(key, String(value));
  const query = params.toString();
  return z
    .strictObject({
      rows: z.array(COLLECTION_SCHEMAS[collection].view),
      nextCursor: z.string().nullable(),
    })
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
 * @returns {Promise<object>} The created record. A tax ID another record of the kind holds fails with `DUPLICATE_TAX_ID` (M0005-R048).
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
 * Resend a person's failed portal-access request (I0008-R007).
 * @param {'people'|'organization-contacts'} collection
 * @param {string} id
 * @param {string} [temporaryPassword] Required when the person's access is on.
 * @returns {Promise<object>}
 */
export async function retryPortalAccess(collection, id, temporaryPassword) {
  return COLLECTION_SCHEMAS[collection].view.parse(
    await apiPost(
      `${DIRECTORY_BASE}/${collection}/${id}/portal-access/retry`,
      temporaryPassword === undefined ? {} : { temporaryPassword }
    )
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
 * Archive or restore several records at once, all or nothing (M0005-R030).
 * A failure is `BULK_FAILED` with `details` naming each failed record.
 * @param {'people'|'organizations'|'organization-contacts'} collection
 * @param {'archive'|'restore'} action
 * @param {{id: string, revision: number}[]} items
 * @returns {Promise<object[]>} The changed records.
 */
export async function bulkDirectoryAction(collection, action, items) {
  const data = await apiPost(`${DIRECTORY_BASE}/${collection}/${action}`, {
    items,
  });
  return z
    .strictObject({ rows: z.array(COLLECTION_SCHEMAS[collection].view) })
    .parse(data).rows;
}

/**
 * Reveal a full tax ID; the server records who read it (M0005-R012).
 * @param {'people'|'organizations'|'organization-contacts'} collection
 * @param {string} id
 * @returns {Promise<string>} The canonical tax ID, which the caller lays out in its format (M0005-R040).
 */
export async function revealTaxId(collection, id) {
  return z
    .strictObject({ taxId: z.string().regex(/^[0-9A-Z]{4,32}$/) })
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
 * @param {{appliesTo?: 'email'|'phone'|'address', archived?: boolean}} [filters]
 *   `archived` lists only archived labels (I0011-R009).
 * @returns {Promise<object[]>}
 */
export async function listContactLabels({ appliesTo, archived } = {}) {
  const params = new URLSearchParams();
  if (appliesTo) params.set('appliesTo', appliesTo);
  if (archived) params.set('archived', 'true');
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

/**
 * Archive or restore several labels at once, all or nothing (M0005-R032).
 * A failure is `BULK_FAILED` with `details` naming each failed label.
 * @param {'archive'|'restore'} action
 * @param {{id: string, revision: number}[]} items
 * @returns {Promise<object[]>} The changed labels.
 */
export async function bulkContactLabelAction(action, items) {
  const data = await apiPost(`${DIRECTORY_BASE}/labels/${action}`, { items });
  return z.strictObject({ rows: z.array(contactLabelViewSchema) }).parse(data)
    .rows;
}

/**
 * The tenant's tax ID formats, archived ones included, since those still
 * format the tax IDs that use them (M0005-R041).
 * @returns {Promise<object[]>}
 */
export async function listTaxIdFormats() {
  return z
    .array(taxIdFormatViewSchema)
    .parse(await apiGet(`${DIRECTORY_BASE}/tax-id-formats`));
}

/**
 * @param {{country: string, name: string, mask: string}} input
 * @returns {Promise<object>}
 */
export async function createTaxIdFormat(input) {
  return taxIdFormatViewSchema.parse(
    await apiPost(`${DIRECTORY_BASE}/tax-id-formats`, input)
  );
}

/**
 * @param {string} id
 * @param {{name: string, mask: string, revision: number}} input
 * @returns {Promise<object>}
 */
export async function updateTaxIdFormat(id, input) {
  return taxIdFormatViewSchema.parse(
    await apiPatch(`${DIRECTORY_BASE}/tax-id-formats/${id}`, input)
  );
}

/**
 * @param {string} id
 * @param {number} revision
 * @returns {Promise<object>}
 */
export async function archiveTaxIdFormat(id, revision) {
  return taxIdFormatViewSchema.parse(
    await apiPost(`${DIRECTORY_BASE}/tax-id-formats/${id}/archive`, {
      revision,
    })
  );
}

/**
 * @param {string} id
 * @param {number} revision
 * @returns {Promise<object>}
 */
export async function restoreTaxIdFormat(id, revision) {
  return taxIdFormatViewSchema.parse(
    await apiPost(`${DIRECTORY_BASE}/tax-id-formats/${id}/restore`, {
      revision,
    })
  );
}

/**
 * Archive or restore several tax ID formats at once, all or nothing
 * (M0005-R042).
 * @param {'archive'|'restore'} action
 * @param {{id: string, revision: number}[]} items
 * @returns {Promise<object[]>} The changed formats.
 */
export async function bulkTaxIdFormatAction(action, items) {
  const data = await apiPost(`${DIRECTORY_BASE}/tax-id-formats/${action}`, {
    items,
  });
  return z.strictObject({ rows: z.array(taxIdFormatViewSchema) }).parse(data)
    .rows;
}

// ---------------------------------------------------------------------------
// Tenant settings (M0006)
// ---------------------------------------------------------------------------

const TENANT_SETTINGS_BASE = '/api/tenant-settings/v1';

/**
 * Every general setting with its stored value or default (M0006-01-R005).
 * @returns {Promise<{settings: Record<string, {value: unknown, stored: boolean}>, revision: number}>}
 */
export async function getGeneralSettings() {
  return generalSettingsViewSchema.parse(
    await apiGet(`${TENANT_SETTINGS_BASE}/general`)
  );
}

/**
 * Save or reset general settings; `null` returns one to its default
 * (M0006-01-R006).
 * @param {{settings: Record<string, unknown>, revision: number}} input
 * @returns {Promise<{settings: object, revision: number}>}
 */
export async function updateGeneralSettings(input) {
  return generalSettingsViewSchema.parse(
    await apiPatch(`${TENANT_SETTINGS_BASE}/general`, input)
  );
}

/**
 * The values to apply in the selected tenant (M0006-01-R008).
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getEffectiveSettings() {
  return effectiveSettingsSchema.parse(
    await apiGet(`${TENANT_SETTINGS_BASE}/effective`)
  );
}

/**
 * The tenant's storage connection without its secret, or `null`
 * (M0006-02-R003).
 * @returns {Promise<object|null>}
 */
export async function getStorage() {
  return storageViewSchema.parse(
    await apiGet(`${TENANT_SETTINGS_BASE}/storage`)
  );
}

/**
 * Test and save the storage connection (M0006-02-R004, R005). Leave out
 * `secretAccessKey` to keep the saved one.
 * @param {{endpoint: string, region: string, bucket: string, accessKeyId: string, secretAccessKey?: string, revision: number|null}} input
 * @returns {Promise<object>}
 */
export async function saveStorage(input) {
  return storageViewSchema.parse(
    await apiPut(`${TENANT_SETTINGS_BASE}/storage`, input)
  );
}

/**
 * Disconnect storage; files stay in the bucket (M0006-02-R006).
 * @param {number} revision
 * @returns {Promise<void>}
 */
export async function deleteStorage(revision) {
  await apiDelete(
    `${TENANT_SETTINGS_BASE}/storage?revision=${encodeURIComponent(revision)}`
  );
}

/**
 * Upload or replace the tenant logo (M0006-02-R013).
 * @param {File} file
 * @returns {Promise<{logoFileId: string}>}
 */
export async function uploadLogo(file) {
  const form = new FormData();
  form.append('file', file);
  return logoViewSchema.parse(
    await apiPut(`${TENANT_SETTINGS_BASE}/logo`, form)
  );
}

/**
 * Remove the tenant logo (M0006-02-R013).
 * @returns {Promise<void>}
 */
export async function deleteLogo() {
  await apiDelete(`${TENANT_SETTINGS_BASE}/logo`);
}

/**
 * A signed link to one stored file, valid for at most 15 minutes
 * (M0006-02-R010).
 * @param {string} id
 * @returns {Promise<{url: string, expiresAt: string}>}
 */
export async function getFileLink(id) {
  return fileLinkSchema.parse(
    await apiGet(`${TENANT_SETTINGS_BASE}/files/${encodeURIComponent(id)}/link`)
  );
}

/**
 * The signed-in member's own profile in the selected tenant (M0006-03 §10).
 * @returns {Promise<object>}
 */
export async function getProfile() {
  return profileViewSchema.parse(
    await apiGet(`${TENANT_SETTINGS_BASE}/profile`)
  );
}

/**
 * Save or remove overrides, or choose a default image or none
 * (M0006-03-R002, R004).
 * @param {{overrides?: Record<string, unknown>, defaultImage?: string|null, revision: number}} input
 * @returns {Promise<object>}
 */
export async function updateProfile(input) {
  return profileViewSchema.parse(
    await apiPatch(`${TENANT_SETTINGS_BASE}/profile`, input)
  );
}

/**
 * Upload or replace the member's profile image (M0006-03-R004).
 * @param {File} file
 * @returns {Promise<object>}
 */
export async function uploadProfileImage(file) {
  const form = new FormData();
  form.append('file', file);
  return profileViewSchema.parse(
    await apiPut(`${TENANT_SETTINGS_BASE}/profile/image`, form)
  );
}
