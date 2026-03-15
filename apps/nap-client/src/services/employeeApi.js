/**
 * @file Employee API methods — CRUD for employee management
 * @module nap-client/services/employeeApi
 *
 * Base path: /core/v1/employees
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/core/v1/employees';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const employeeApi = {
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),
  getById: (id) => client.get(`${BASE}/${id}`),
  create: (body) => client.post(BASE, body),
  update: (filterParams, changes) => client.put(`${BASE}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${BASE}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${BASE}/restore${qs(filterParams)}`, {}),
  resetPassword: (id, password) => client.post(`${BASE}/${id}/reset-password`, { password }),
  importXls: (formData) => client.post(`${BASE}/import-xls`, formData),
  exportXls: (body = {}) => client.post(`${BASE}/export-xls`, body, { responseType: 'blob' }),
};

export default employeeApi;
