/**
 * @file Accounting & GL API methods — CRUD for chart of accounts, journal entries, ledger, posting
 * @module nap-client/services/accountingApi
 *
 * Base paths under /accounting/v1/*
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

function readOnly(base) {
  return {
    list: (params = {}) => client.get(`${base}${qs(params)}`),
    getById: (id) => client.get(`${base}/${id}`),
  };
}

export const chartOfAccountsApi = crud('/accounting/v1/chart-of-accounts');
export const journalEntryApi = {
  ...crud('/accounting/v1/journal-entries'),
  /** POST /post — post entries to GL. */
  post: (body) => client.post('/accounting/v1/journal-entries/post', body),
  /** POST /reverse — reverse posted entries. */
  reverse: (body) => client.post('/accounting/v1/journal-entries/reverse', body),
};
export const journalEntryLineApi = crud('/accounting/v1/journal-entry-lines');
export const ledgerBalanceApi = readOnly('/accounting/v1/ledger-balances');
export const postingQueueApi = {
  ...crud('/accounting/v1/posting-queues'),
  /** POST /retry — retry failed postings. */
  retry: (body) => client.post('/accounting/v1/posting-queues/retry', body),
};
