/**
 * @file RBAC API methods — CRUD for roles, role members, policies, and policy catalog
 * @module nap-client/services/rbacApi
 *
 * All update/archive/restore endpoints read identifiers from query params.
 * Base paths: /core/v1/roles, /core/v1/role-members, /core/v1/policies, /core/v1/policy-catalog
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

/** Build a query-string suffix from a params object. */
const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

// ── Roles ───────────────────────────────────────────────────────────────────

const ROLES_BASE = '/core/v1/roles';

export const rolesApi = {
  /** GET / — cursor-based pagination. */
  list: (params = {}) => client.get(`${ROLES_BASE}${qs(params)}`),

  /** GET /:id — single role by UUID. */
  getById: (id) => client.get(`${ROLES_BASE}/${id}`),

  /** POST / — create a new role. */
  create: (body) => client.post(ROLES_BASE, body),

  /** PUT /update?{filter} — update role fields. */
  update: (filterParams, changes) =>
    client.put(`${ROLES_BASE}/update${qs(filterParams)}`, changes),

  /** DELETE /archive?{filter} — soft-delete role. */
  archive: (filterParams) =>
    client.del(`${ROLES_BASE}/archive${qs(filterParams)}`, {}),

  /** PATCH /restore?{filter} — reactivate role. */
  restore: (filterParams) =>
    client.patch(`${ROLES_BASE}/restore${qs(filterParams)}`, {}),
};

// ── Role Members ────────────────────────────────────────────────────────────

const MEMBERS_BASE = '/core/v1/role-members';

export const roleMembersApi = {
  /** GET /where?role_id=... — list members for a specific role. */
  list: (params = {}) => client.get(`${MEMBERS_BASE}/where${qs(params)}`),

  /** POST / — add a single member to a role. */
  create: (body) => client.post(MEMBERS_BASE, body),

  /** PUT /sync — replace all members for a role. Accepts { role_id, user_ids }. */
  sync: (body) => client.put(`${MEMBERS_BASE}/sync`, body),

  /** DELETE /remove?role_id=...&user_id=... — hard-delete a single membership. */
  remove: (params) => client.del(`${MEMBERS_BASE}/remove${qs(params)}`, {}),
};

// ── Policies ────────────────────────────────────────────────────────────────

const POLICIES_BASE = '/core/v1/policies';

export const policiesApi = {
  /** GET /where?role_id=... — list policies for a specific role. */
  list: (params = {}) => client.get(`${POLICIES_BASE}/where${qs(params)}`),

  /** PUT /sync-for-role — replace all policies for a role. Accepts { role_id, policies }. */
  syncForRole: (body) => client.put(`${POLICIES_BASE}/sync-for-role`, body),
};

// ── Policy Catalog ──────────────────────────────────────────────────────────

const CATALOG_BASE = '/core/v1/policy-catalog';

export const policyCatalogApi = {
  /** GET / — fetch full catalog of valid module/router/action combinations. */
  list: (params = {}) => client.get(`${CATALOG_BASE}${qs(params)}`),
};

export default { rolesApi, roleMembersApi, policiesApi, policyCatalogApi };
