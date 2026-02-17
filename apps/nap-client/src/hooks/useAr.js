/**
 * @file React Query hooks for AR module data
 * @module nap-client/hooks/useAr
 *
 * Provides query and mutation hooks for AR clients, invoices, and receipts.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { arClientApi, arInvoiceApi, receiptApi } from '../services/arApi.js';

/* ── AR Clients ──────────────────────────────────────────────── */

const CLIENT_KEY = ['ar-clients'];

export function useArClients(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...CLIENT_KEY, params], queryFn: () => arClientApi.list(params) });
}

export function useCreateArClient() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => arClientApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: CLIENT_KEY }) });
}

export function useUpdateArClient() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => arClientApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: CLIENT_KEY }) });
}

export function useArchiveArClient() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => arClientApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: CLIENT_KEY }) });
}

export function useRestoreArClient() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => arClientApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: CLIENT_KEY }) });
}

/* ── AR Invoices ─────────────────────────────────────────────── */

const INV_KEY = ['ar-invoices'];

export function useArInvoices(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...INV_KEY, params], queryFn: () => arInvoiceApi.list(params) });
}

export function useCreateArInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => arInvoiceApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: INV_KEY }) });
}

export function useUpdateArInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => arInvoiceApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: INV_KEY }) });
}

export function useArchiveArInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => arInvoiceApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: INV_KEY }) });
}

export function useRestoreArInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => arInvoiceApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: INV_KEY }) });
}

/* ── Receipts ────────────────────────────────────────────────── */

const REC_KEY = ['receipts'];

export function useReceipts(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...REC_KEY, params], queryFn: () => receiptApi.list(params) });
}

export function useCreateReceipt() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => receiptApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: REC_KEY }) });
}

export function useUpdateReceipt() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => receiptApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: REC_KEY }) });
}

export function useArchiveReceipt() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => receiptApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: REC_KEY }) });
}

export function useRestoreReceipt() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => receiptApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: REC_KEY }) });
}
