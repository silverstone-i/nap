/**
 * @file Policy API methods — CRUD for RBAC policies and read-only policy catalog
 * @module nap-client/services/policyApi
 *
 * Base paths: /core/v1/policies, /core/v1/policy-catalog
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/core/v1/policies';
const CATALOG_BASE = '/core/v1/policy-catalog';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const policyApi = {
  listForRole: (roleId) => client.get(`${BASE}/where${qs({ role_id: roleId })}`),
  syncForRole: (roleId, policies) => client.put(`${BASE}/sync-for-role`, { role_id: roleId, policies }),
};

export const policyCatalogApi = {
  list: (params = {}) => client.get(`${CATALOG_BASE}${qs(params)}`),
};

export default policyApi;
