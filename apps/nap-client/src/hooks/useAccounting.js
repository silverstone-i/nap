/**
 * @file React Query hooks for Accounting & GL data
 * @module nap-client/hooks/useAccounting
 *
 * Provides query and mutation hooks for chart of accounts, journal entries,
 * journal entry lines, ledger balances, and posting queues.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  chartOfAccountsApi, journalEntryApi, journalEntryLineApi,
  ledgerBalanceApi, postingQueueApi,
} from '../services/accountingApi.js';

/* ── Chart of Accounts ───────────────────────────────────────── */

const COA_KEY = ['chart-of-accounts'];

export function useChartOfAccounts(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...COA_KEY, params], queryFn: () => chartOfAccountsApi.list(params) });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => chartOfAccountsApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: COA_KEY }) });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => chartOfAccountsApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: COA_KEY }) });
}

export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => chartOfAccountsApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: COA_KEY }) });
}

export function useRestoreAccount() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => chartOfAccountsApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: COA_KEY }) });
}

/* ── Journal Entries ─────────────────────────────────────────── */

const JE_KEY = ['journal-entries'];

export function useJournalEntries(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...JE_KEY, params], queryFn: () => journalEntryApi.list(params) });
}

export function useCreateJournalEntry() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => journalEntryApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: JE_KEY }) });
}

export function useUpdateJournalEntry() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => journalEntryApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: JE_KEY }) });
}

export function usePostJournalEntries() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => journalEntryApi.post(body), onSuccess: () => qc.invalidateQueries({ queryKey: JE_KEY }) });
}

export function useReverseJournalEntries() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => journalEntryApi.reverse(body), onSuccess: () => qc.invalidateQueries({ queryKey: JE_KEY }) });
}

export function useArchiveJournalEntry() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => journalEntryApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: JE_KEY }) });
}

export function useRestoreJournalEntry() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => journalEntryApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: JE_KEY }) });
}

/* ── Journal Entry Lines ─────────────────────────────────────── */

const JEL_KEY = ['journal-entry-lines'];

export function useJournalEntryLines(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...JEL_KEY, params], queryFn: () => journalEntryLineApi.list(params) });
}

/* ── Ledger Balances (read-only) ─────────────────────────────── */

const LB_KEY = ['ledger-balances'];

export function useLedgerBalances(params = { limit: 500 }) {
  return useQuery({ queryKey: [...LB_KEY, params], queryFn: () => ledgerBalanceApi.list(params) });
}

/* ── Posting Queues ──────────────────────────────────────────── */

const PQ_KEY = ['posting-queues'];

export function usePostingQueues(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...PQ_KEY, params], queryFn: () => postingQueueApi.list(params) });
}

export function useRetryPostingQueue() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => postingQueueApi.retry(body), onSuccess: () => qc.invalidateQueries({ queryKey: PQ_KEY }) });
}
