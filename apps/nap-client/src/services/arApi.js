/**
 * @file AR API methods — CRUD for AR invoices, invoice lines, receipts
 * @module nap-client/services/arApi
 *
 * No ar_clients — PRD removed ar_clients table.
 * AR invoices reference the unified clients table from core entities.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

/* ---- AR Invoices ---- */
const INVOICES = '/ar/v1/ar-invoices';

export const arInvoiceApi = {
  list: (params = {}) => client.get(`${INVOICES}${qs(params)}`),
  getById: (id) => client.get(`${INVOICES}/${id}`),
  create: (body) => client.post(INVOICES, body),
  update: (filterParams, changes) => client.put(`${INVOICES}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${INVOICES}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${INVOICES}/restore${qs(filterParams)}`, {}),
  approve: (filterParams) => client.put(`${INVOICES}/approve${qs(filterParams)}`, {}),
};

/* ---- AR Invoice Lines ---- */
const LINES = '/ar/v1/ar-invoice-lines';

export const arInvoiceLineApi = {
  list: (params = {}) => client.get(`${LINES}${qs(params)}`),
  getById: (id) => client.get(`${LINES}/${id}`),
  create: (body) => client.post(LINES, body),
  update: (filterParams, changes) => client.put(`${LINES}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${LINES}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${LINES}/restore${qs(filterParams)}`, {}),
};

/* ---- Receipts ---- */
const RECEIPTS = '/ar/v1/receipts';

export const receiptApi = {
  list: (params = {}) => client.get(`${RECEIPTS}${qs(params)}`),
  getById: (id) => client.get(`${RECEIPTS}/${id}`),
  create: (body) => client.post(RECEIPTS, body),
  update: (filterParams, changes) => client.put(`${RECEIPTS}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${RECEIPTS}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${RECEIPTS}/restore${qs(filterParams)}`, {}),
};
