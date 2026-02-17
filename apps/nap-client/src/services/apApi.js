/**
 * @file AP module API methods — CRUD for invoices, payments, credit memos
 * @module nap-client/services/apApi
 *
 * Base paths under /ap/v1/*
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

export const apInvoiceApi = crud('/ap/v1/ap-invoices');
export const paymentApi = crud('/ap/v1/payments');
export const apCreditMemoApi = crud('/ap/v1/ap-credit-memos');
