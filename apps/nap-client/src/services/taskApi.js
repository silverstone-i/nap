/**
 * @file Task API methods — CRUD for unit tasks
 * @module nap-client/services/taskApi
 *
 * Base path: /projects/v1/tasks
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/projects/v1/tasks';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const taskApi = {
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),
  getById: (id) => client.get(`${BASE}/${id}`),
  create: (body) => client.post(BASE, body),
  update: (filterParams, changes) => client.put(`${BASE}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${BASE}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${BASE}/restore${qs(filterParams)}`, {}),
};

export default taskApi;
