/**
 * @file Phone Number API methods — CRUD for phone numbers linked via sources
 * @module nap-client/services/phoneNumberApi
 *
 * Base path: /core/v1/phone-numbers
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/core/v1/phone-numbers';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const phoneNumberApi = {
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),
  getById: (id) => client.get(`${BASE}/${id}`),
  create: (body) => client.post(BASE, body),
  update: (filterParams, changes) => client.put(`${BASE}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${BASE}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${BASE}/restore${qs(filterParams)}`, {}),
};

export default phoneNumberApi;
