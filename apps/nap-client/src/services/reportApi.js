/**
 * @file Report API methods — read-only report endpoints
 * @module nap-client/services/reportApi
 *
 * Base path: /reports/v1/*
 * All endpoints are GET-only.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

export const reportApi = {
  /** GET /project-profitability — all projects profitability summary. */
  profitabilityAll: () => client.get('/reports/v1/project-profitability'),

  /** GET /project-profitability/:projectId — single project profitability. */
  profitabilityByProject: (projectId) =>
    client.get(`/reports/v1/project-profitability/${projectId}`),

  /** GET /project-cashflow/:projectId — monthly cashflow for a project. */
  cashflowByProject: (projectId) =>
    client.get(`/reports/v1/project-cashflow/${projectId}`),

  /** GET /project-cashflow/:projectId/forecast — expected inflows/outflows + burn rate. */
  cashflowForecast: (projectId) =>
    client.get(`/reports/v1/project-cashflow/${projectId}/forecast`),

  /** GET /project-cost-breakdown/:projectId — category-level cost breakdown. */
  costBreakdownByProject: (projectId) =>
    client.get(`/reports/v1/project-cost-breakdown/${projectId}`),

  /** GET /ar-aging — AR aging buckets per client. */
  arAging: () => client.get('/reports/v1/ar-aging'),

  /** GET /ar-aging/:clientId — AR aging for one client. */
  arAgingByClient: (clientId) =>
    client.get(`/reports/v1/ar-aging/${clientId}`),

  /** GET /ap-aging — AP aging buckets per vendor. */
  apAging: () => client.get('/reports/v1/ap-aging'),

  /** GET /ap-aging/:vendorId — AP aging for one vendor. */
  apAgingByVendor: (vendorId) =>
    client.get(`/reports/v1/ap-aging/${vendorId}`),

  /** GET /company-cashflow — company-wide monthly cashflow. */
  companyCashflow: () => client.get('/reports/v1/company-cashflow'),

  /** GET /margin-analysis — margin analysis with sorting. */
  marginAnalysis: (params = {}) =>
    client.get(`/reports/v1/margin-analysis${qs(params)}`),
};

export default reportApi;
