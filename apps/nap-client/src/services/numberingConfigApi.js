/**
 * @file API service for tenant numbering configuration
 * @module nap-client/services/numberingConfigApi
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/core/v1/numbering-config';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const numberingConfigApi = {
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),
  getById: (id) => client.get(`${BASE}/${id}`),
  update: (filterParams, changes) => client.put(`${BASE}/update${qs(filterParams)}`, changes),
};

export default numberingConfigApi;
