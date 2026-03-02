/**
 * @file React Query hooks for AP module (invoices, invoice lines, payments, credit memos)
 * @module nap-client/hooks/useAp
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apInvoiceApi, apInvoiceLineApi, paymentApi, apCreditMemoApi } from '../services/apApi.js';

/* ---- AP Invoices ---- */
const AP_INVOICES_KEY = ['apInvoices'];

export function useApInvoices(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...AP_INVOICES_KEY, params], queryFn: () => apInvoiceApi.list(params) });
}

export function useApInvoice(id) {
  return useQuery({ queryKey: [...AP_INVOICES_KEY, id], queryFn: () => apInvoiceApi.getById(id), enabled: !!id });
}

export function useCreateApInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => apInvoiceApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: AP_INVOICES_KEY }) });
}

export function useUpdateApInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => apInvoiceApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: AP_INVOICES_KEY }),
  });
}

export function useArchiveApInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => apInvoiceApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: AP_INVOICES_KEY }),
  });
}

export function useRestoreApInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => apInvoiceApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: AP_INVOICES_KEY }),
  });
}

/* ---- AP Invoice Lines ---- */
const AP_LINES_KEY = ['apInvoiceLines'];

export function useApInvoiceLines(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...AP_LINES_KEY, params], queryFn: () => apInvoiceLineApi.list(params) });
}

export function useCreateApInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => apInvoiceLineApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AP_LINES_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

export function useUpdateApInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => apInvoiceLineApi.update(filter, changes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AP_LINES_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

export function useArchiveApInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => apInvoiceLineApi.archive(filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AP_LINES_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

export function useRestoreApInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => apInvoiceLineApi.restore(filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AP_LINES_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

/* ---- Payments ---- */
const PAYMENTS_KEY = ['payments'];

export function usePayments(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...PAYMENTS_KEY, params], queryFn: () => paymentApi.list(params) });
}

export function usePayment(id) {
  return useQuery({ queryKey: [...PAYMENTS_KEY, id], queryFn: () => paymentApi.getById(id), enabled: !!id });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => paymentApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => paymentApi.update(filter, changes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

export function useArchivePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => paymentApi.archive(filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

export function useRestorePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => paymentApi.restore(filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

/* ---- AP Credit Memos ---- */
const CREDITS_KEY = ['apCreditMemos'];

export function useApCreditMemos(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...CREDITS_KEY, params], queryFn: () => apCreditMemoApi.list(params) });
}

export function useApCreditMemo(id) {
  return useQuery({ queryKey: [...CREDITS_KEY, id], queryFn: () => apCreditMemoApi.getById(id), enabled: !!id });
}

export function useCreateApCreditMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => apCreditMemoApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CREDITS_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

export function useUpdateApCreditMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => apCreditMemoApi.update(filter, changes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CREDITS_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

export function useArchiveApCreditMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => apCreditMemoApi.archive(filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CREDITS_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}

export function useRestoreApCreditMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => apCreditMemoApi.restore(filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CREDITS_KEY });
      qc.invalidateQueries({ queryKey: AP_INVOICES_KEY });
    },
  });
}
