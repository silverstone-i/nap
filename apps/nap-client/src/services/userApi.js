/**
 * @file User API methods — CRUD for nap_users management
 * @module nap-client/services/userApi
 *
 * All update/archive/restore endpoints read identifiers from query params.
 * Base path: /tenants/v1/nap-users
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/tenants/v1/nap-users';

/** Build a query-string suffix from a params object. */
const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const userApi = {
  /** GET / — cursor-based pagination (password_hash stripped server-side). */
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),

  /** GET /:id — single user by UUID. */
  getById: (id) => client.get(`${BASE}/${id}`),

  /** POST /register — register a new user with phones/addresses. */
  register: (body) => client.post(`${BASE}/register`, body),

  /** PUT /update?{filter} — filter in query string, changes in body. */
  update: (filterParams, changes) =>
    client.put(`${BASE}/update${qs(filterParams)}`, changes),

  /** DELETE /archive?{filter} — soft-delete user. */
  archive: (filterParams) =>
    client.del(`${BASE}/archive${qs(filterParams)}`, {}),

  /** PATCH /restore?{filter} — reactivate user. */
  restore: (filterParams) =>
    client.patch(`${BASE}/restore${qs(filterParams)}`, {}),
};

export default userApi;
