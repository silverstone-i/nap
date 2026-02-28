/**
 * @file React Query hooks for AR module (invoices, invoice lines, receipts)
 * @module nap-client/hooks/useAr
 *
 * No ar_clients — PRD removed ar_clients table.
 * AR invoices reference the unified clients table from core entities.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { arInvoiceApi, arInvoiceLineApi, receiptApi } from '../services/arApi.js';

/* ---- AR Invoices ---- */
const AR_INVOICES_KEY = ['arInvoices'];

export function useArInvoices(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...AR_INVOICES_KEY, params], queryFn: () => arInvoiceApi.list(params) });
}

export function useArInvoice(id) {
  return useQuery({ queryKey: [...AR_INVOICES_KEY, id], queryFn: () => arInvoiceApi.getById(id), enabled: !!id });
}

export function useCreateArInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => arInvoiceApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: AR_INVOICES_KEY }) });
}

export function useUpdateArInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => arInvoiceApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: AR_INVOICES_KEY }),
  });
}

export function useArchiveArInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => arInvoiceApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: AR_INVOICES_KEY }),
  });
}

export function useRestoreArInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => arInvoiceApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: AR_INVOICES_KEY }),
  });
}

export function useApproveArInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => arInvoiceApi.approve(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: AR_INVOICES_KEY }),
  });
}

/* ---- AR Invoice Lines ---- */
const AR_LINES_KEY = ['arInvoiceLines'];

export function useArInvoiceLines(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...AR_LINES_KEY, params], queryFn: () => arInvoiceLineApi.list(params) });
}

export function useCreateArInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => arInvoiceLineApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AR_LINES_KEY });
      qc.invalidateQueries({ queryKey: AR_INVOICES_KEY });
    },
  });
}

export function useUpdateArInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => arInvoiceLineApi.update(filter, changes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AR_LINES_KEY });
      qc.invalidateQueries({ queryKey: AR_INVOICES_KEY });
    },
  });
}

export function useArchiveArInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => arInvoiceLineApi.archive(filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AR_LINES_KEY });
      qc.invalidateQueries({ queryKey: AR_INVOICES_KEY });
    },
  });
}

export function useRestoreArInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => arInvoiceLineApi.restore(filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AR_LINES_KEY });
      qc.invalidateQueries({ queryKey: AR_INVOICES_KEY });
    },
  });
}

/* ---- Receipts ---- */
const RECEIPTS_KEY = ['receipts'];

export function useReceipts(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...RECEIPTS_KEY, params], queryFn: () => receiptApi.list(params) });
}

export function useReceipt(id) {
  return useQuery({ queryKey: [...RECEIPTS_KEY, id], queryFn: () => receiptApi.getById(id), enabled: !!id });
}

export function useCreateReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => receiptApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEIPTS_KEY });
      qc.invalidateQueries({ queryKey: AR_INVOICES_KEY });
    },
  });
}

export function useUpdateReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => receiptApi.update(filter, changes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEIPTS_KEY });
      qc.invalidateQueries({ queryKey: AR_INVOICES_KEY });
    },
  });
}

export function useArchiveReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => receiptApi.archive(filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEIPTS_KEY });
      qc.invalidateQueries({ queryKey: AR_INVOICES_KEY });
    },
  });
}

export function useRestoreReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => receiptApi.restore(filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEIPTS_KEY });
      qc.invalidateQueries({ queryKey: AR_INVOICES_KEY });
    },
  });
}
