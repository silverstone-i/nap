/**
 * @file Tenant API methods — CRUD for tenant management
 * @module nap-client/services/tenantApi
 *
 * All update/archive/restore endpoints read identifiers from query params.
 * Base path: /tenants/v1/tenants
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/tenants/v1/tenants';

/** Build a query-string suffix from a params object. */
const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const tenantApi = {
  /** GET / — cursor-based pagination. */
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),

  /** GET /:id — single tenant by UUID. */
  getById: (id) => client.get(`${BASE}/${id}`),

  /** POST / — create tenant with admin user + schema provisioning. */
  create: (body) => client.post(BASE, body),

  /** PUT /update?{filter} — filter in query string, changes in body. */
  update: (filterParams, changes) =>
    client.put(`${BASE}/update${qs(filterParams)}`, changes),

  /** DELETE /archive?{filter} — soft-delete tenant + cascade deactivate users. */
  archive: (filterParams) =>
    client.del(`${BASE}/archive${qs(filterParams)}`, {}),

  /** PATCH /restore?{filter} — reactivate tenant + cascade reactivate users. */
  restore: (filterParams) =>
    client.patch(`${BASE}/restore${qs(filterParams)}`, {}),
};

export default tenantApi;
