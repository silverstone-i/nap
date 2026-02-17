/**
 * @file Project-family API methods — CRUD for projects, units, tasks, cost items, change orders
 * @module nap-client/services/projectApi
 *
 * All standard CRUD endpoints follow the same pattern as tenantApi.
 * Base paths under /projects/v1/*
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

function crud(base) {
  return {
    list: (params = {}) => client.get(`${base}${qs(params)}`),
    getById: (id) => client.get(`${base}/${id}`),
    create: (body) => client.post(base, body),
    update: (filterParams, changes) => client.put(`${base}/update${qs(filterParams)}`, changes),
    archive: (filterParams) => client.del(`${base}/archive${qs(filterParams)}`, {}),
    restore: (filterParams) => client.patch(`${base}/restore${qs(filterParams)}`, {}),
  };
}

export const projectApi = crud('/projects/v1/projects');
export const unitApi = crud('/projects/v1/units');
export const taskApi = crud('/projects/v1/tasks');
export const costItemApi = crud('/projects/v1/cost-items');
export const changeOrderApi = crud('/projects/v1/change-orders');
