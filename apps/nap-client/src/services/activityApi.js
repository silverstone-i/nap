/**
 * @file Activity-family API methods — CRUD for categories, activities, deliverables, budgets, costs
 * @module nap-client/services/activityApi
 *
 * Base paths under /activities/v1/*
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

export const categoryApi = crud('/activities/v1/categories');
export const activityApi = crud('/activities/v1/activities');
export const deliverableApi = crud('/activities/v1/deliverables');
export const deliverableAssignmentApi = crud('/activities/v1/deliverable-assignments');
export const budgetApi = {
  ...crud('/activities/v1/budgets'),
  /** POST /new-version — create a new budget version. */
  newVersion: (body) => client.post('/activities/v1/budgets/new-version', body),
};
export const costLineApi = crud('/activities/v1/cost-lines');
export const actualCostApi = crud('/activities/v1/actual-costs');
