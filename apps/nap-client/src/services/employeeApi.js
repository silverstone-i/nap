/**
 * @file Employee API methods — CRUD for tenant-scope employees
 * @module nap-client/services/employeeApi
 *
 * All update/archive/restore endpoints read identifiers from query params.
 * Base path: /core/v1/employees
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/core/v1/employees';

/** Build a query-string suffix from a params object. */
const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const employeeApi = {
  /** GET / — cursor-based pagination. */
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),

  /** GET /:id — single employee by UUID. */
  getById: (id) => client.get(`${BASE}/${id}`),

  /** POST / — create a new employee. */
  create: (body) => client.post(BASE, body),

  /** PUT /update?{filter} — filter in query string, changes in body. */
  update: (filterParams, changes) =>
    client.put(`${BASE}/update${qs(filterParams)}`, changes),

  /** DELETE /archive?{filter} — soft-delete employee. */
  archive: (filterParams) =>
    client.del(`${BASE}/archive${qs(filterParams)}`, {}),

  /** PATCH /restore?{filter} — reactivate employee. */
  restore: (filterParams) =>
    client.patch(`${BASE}/restore${qs(filterParams)}`, {}),
};

export default employeeApi;
