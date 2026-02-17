/**
 * @file AR module API methods — CRUD for clients, invoices, receipts
 * @module nap-client/services/arApi
 *
 * Base paths under /ar/v1/*
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

export const arClientApi = crud('/ar/v1/clients');
export const arInvoiceApi = {
  ...crud('/ar/v1/ar-invoices'),
  /** PUT /approve — approval with RBAC enforcement. */
  approve: (filterParams, body) => client.put(`/ar/v1/ar-invoices/approve${qs(filterParams)}`, body),
};
export const receiptApi = crud('/ar/v1/receipts');
