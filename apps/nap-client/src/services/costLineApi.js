/**
 * @file CostLine API methods — CRUD for cost line entries
 * @module nap-client/services/costLineApi
 *
 * Base path: /activities/v1/cost-lines
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/activities/v1/cost-lines';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const costLineApi = {
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),
  getById: (id) => client.get(`${BASE}/${id}`),
  create: (body) => client.post(BASE, body),
  update: (filterParams, changes) => client.put(`${BASE}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${BASE}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${BASE}/restore${qs(filterParams)}`, {}),
};

export default costLineApi;
