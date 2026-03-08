/**
 * @file Field group API methods — CRUD for RBAC Layer 4 definitions and grants
 * @module nap-client/services/fieldGroupApi
 *
 * Base paths: /core/v1/field-group-definitions, /core/v1/field-group-grants
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const DEF_BASE = '/core/v1/field-group-definitions';
const GRANT_BASE = '/core/v1/field-group-grants';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const fieldGroupApi = {
  listDefinitions: (params = {}) => client.get(`${DEF_BASE}${qs(params)}`),
  createDefinition: (body) => client.post(DEF_BASE, body),
  updateDefinition: (id, body) => client.put(`${DEF_BASE}/update${qs({ id })}`, body),
  archiveDefinition: (id) => client.del(`${DEF_BASE}/archive${qs({ id })}`),
  listGrantsForRole: (roleId) => client.get(`${GRANT_BASE}/where${qs({ role_id: roleId })}`),
  syncGrantsForRole: (roleId, grantIds) =>
    client.put(`${GRANT_BASE}/sync-for-role`, { role_id: roleId, grant_ids: grantIds }),
};

export default fieldGroupApi;
