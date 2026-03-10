/**
 * @file Country API methods — read-only access to ISO 3166-1 reference data
 * @module nap-client/services/countryApi
 *
 * Base path: /tenants/v1/countries
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/tenants/v1/countries';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const countryApi = {
  list: (params = {}) => client.get(`${BASE}${qs(params)}`),
  getById: (id) => client.get(`${BASE}/${id}`),
};

export default countryApi;
