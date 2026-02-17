/**
 * @file React Query hooks for AP module data
 * @module nap-client/hooks/useAp
 *
 * Provides query and mutation hooks for AP invoices, payments, and credit memos.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apInvoiceApi, paymentApi, apCreditMemoApi } from '../services/apApi.js';

/* ── AP Invoices ─────────────────────────────────────────────── */

const API_KEY = ['ap-invoices'];

export function useApInvoices(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...API_KEY, params], queryFn: () => apInvoiceApi.list(params) });
}

export function useCreateApInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => apInvoiceApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: API_KEY }) });
}

export function useUpdateApInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => apInvoiceApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: API_KEY }) });
}

export function useArchiveApInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => apInvoiceApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: API_KEY }) });
}

export function useRestoreApInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => apInvoiceApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: API_KEY }) });
}

/* ── Payments ────────────────────────────────────────────────── */

const PAY_KEY = ['payments'];

export function usePayments(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...PAY_KEY, params], queryFn: () => paymentApi.list(params) });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => paymentApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: PAY_KEY }) });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => paymentApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: PAY_KEY }) });
}

export function useArchivePayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => paymentApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: PAY_KEY }) });
}

export function useRestorePayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => paymentApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: PAY_KEY }) });
}

/* ── AP Credit Memos ─────────────────────────────────────────── */

const CM_KEY = ['ap-credit-memos'];

export function useApCreditMemos(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...CM_KEY, params], queryFn: () => apCreditMemoApi.list(params) });
}

export function useCreateApCreditMemo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => apCreditMemoApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: CM_KEY }) });
}

export function useUpdateApCreditMemo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => apCreditMemoApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: CM_KEY }) });
}

export function useArchiveApCreditMemo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => apCreditMemoApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: CM_KEY }) });
}

export function useRestoreApCreditMemo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => apCreditMemoApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: CM_KEY }) });
}
