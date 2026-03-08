/**
 * @file Contact API methods — CRUD for contacts linked via sources
 * @module nap-client/services/contactApi
 *
 * Base path: /core/v1/contacts
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/core/v1/contacts';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const contactApi = {
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),
  getById: (id) => client.get(`${BASE}/${id}`),
  create: (body) => client.post(BASE, body),
  update: (filterParams, changes) => client.put(`${BASE}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${BASE}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${BASE}/restore${qs(filterParams)}`, {}),
};

export default contactApi;
