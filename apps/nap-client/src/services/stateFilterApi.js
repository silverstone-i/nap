/**
 * @file State filter API methods — CRUD for RBAC Layer 3 state filters
 * @module nap-client/services/stateFilterApi
 *
 * Base path: /core/v1/state-filters
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const BASE = '/core/v1/state-filters';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const stateFilterApi = {
  listForRole: (roleId) => client.get(`${BASE}/where${qs({ role_id: roleId })}`),
  syncForRole: (roleId, stateFilters) =>
    client.put(`${BASE}/sync-for-role`, { role_id: roleId, state_filters: stateFilters }),
};

export default stateFilterApi;
