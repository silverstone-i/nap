/**
 * @file AP API methods — CRUD for AP invoices, invoice lines, payments, credit memos
 * @module nap-client/services/apApi
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
};

/* ---- AP Invoices ---- */
const INVOICES = '/ap/v1/ap-invoices';

export const apInvoiceApi = {
  list: (params = {}) => client.get(`${INVOICES}${qs(params)}`),
  getById: (id) => client.get(`${INVOICES}/${id}`),
  create: (body) => client.post(INVOICES, body),
  update: (filterParams, changes) => client.put(`${INVOICES}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${INVOICES}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${INVOICES}/restore${qs(filterParams)}`, {}),
};

/* ---- AP Invoice Lines ---- */
const LINES = '/ap/v1/ap-invoice-lines';

export const apInvoiceLineApi = {
  list: (params = {}) => client.get(`${LINES}${qs(params)}`),
  getById: (id) => client.get(`${LINES}/${id}`),
  create: (body) => client.post(LINES, body),
  update: (filterParams, changes) => client.put(`${LINES}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${LINES}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${LINES}/restore${qs(filterParams)}`, {}),
};

/* ---- Payments ---- */
const PAYMENTS = '/ap/v1/payments';

export const paymentApi = {
  list: (params = {}) => client.get(`${PAYMENTS}${qs(params)}`),
  getById: (id) => client.get(`${PAYMENTS}/${id}`),
  create: (body) => client.post(PAYMENTS, body),
  update: (filterParams, changes) => client.put(`${PAYMENTS}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${PAYMENTS}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${PAYMENTS}/restore${qs(filterParams)}`, {}),
};

/* ---- AP Credit Memos ---- */
const CREDITS = '/ap/v1/ap-credit-memos';

export const apCreditMemoApi = {
  list: (params = {}) => client.get(`${CREDITS}${qs(params)}`),
  getById: (id) => client.get(`${CREDITS}/${id}`),
  create: (body) => client.post(CREDITS, body),
  update: (filterParams, changes) => client.put(`${CREDITS}/update${qs(filterParams)}`, changes),
  archive: (filterParams) => client.del(`${CREDITS}/archive${qs(filterParams)}`, {}),
  restore: (filterParams) => client.patch(`${CREDITS}/restore${qs(filterParams)}`, {}),
};
