/**
 * @file DeliverableAssignment API methods — CRUD for deliverable-project links
 * @module nap-client/services/deliverableAssignmentApi
 *
 * Base path: /activities/v1/deliverable-assignments
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/activities/v1/deliverable-assignments';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const deliverableAssignmentApi = {
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),
  getById: (id) => client.get(`${BASE}/${id}`),
  create: (body) => client.post(BASE, body),
  update: (filterParams, changes) => client.put(`${BASE}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${BASE}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${BASE}/restore${qs(filterParams)}`, {}),
};

export default deliverableAssignmentApi;
