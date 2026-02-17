/**
 * @file React Query hooks for activity-family data
 * @module nap-client/hooks/useActivities
 *
 * Provides query and mutation hooks for categories, activities, deliverables,
 * budgets, cost lines, and actual costs.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  categoryApi, activityApi, deliverableApi, deliverableAssignmentApi,
  budgetApi, costLineApi, actualCostApi,
} from '../services/activityApi.js';

/* ── Categories ──────────────────────────────────────────────── */

const CAT_KEY = ['categories'];

export function useCategories(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...CAT_KEY, params], queryFn: () => categoryApi.list(params) });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => categoryApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: CAT_KEY }) });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => categoryApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: CAT_KEY }) });
}

/* ── Activities ──────────────────────────────────────────────── */

const ACT_KEY = ['activities'];

export function useActivities(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...ACT_KEY, params], queryFn: () => activityApi.list(params) });
}

/* ── Deliverables ────────────────────────────────────────────── */

const DEL_KEY = ['deliverables'];

export function useDeliverables(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...DEL_KEY, params], queryFn: () => deliverableApi.list(params) });
}

/* ── Deliverable Assignments ─────────────────────────────────── */

const DA_KEY = ['deliverable-assignments'];

export function useDeliverableAssignments(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...DA_KEY, params], queryFn: () => deliverableAssignmentApi.list(params) });
}

/* ── Budgets ─────────────────────────────────────────────────── */

const BUD_KEY = ['budgets'];

export function useBudgets(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...BUD_KEY, params], queryFn: () => budgetApi.list(params) });
}

export function useCreateBudget() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => budgetApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: BUD_KEY }) });
}

export function useUpdateBudget() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => budgetApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: BUD_KEY }) });
}

export function useArchiveBudget() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => budgetApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: BUD_KEY }) });
}

export function useRestoreBudget() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => budgetApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: BUD_KEY }) });
}

/* ── Cost Lines ──────────────────────────────────────────────── */

const CL_KEY = ['cost-lines'];

export function useCostLines(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...CL_KEY, params], queryFn: () => costLineApi.list(params) });
}

/* ── Actual Costs ────────────────────────────────────────────── */

const AC_KEY = ['actual-costs'];

export function useActualCosts(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...AC_KEY, params], queryFn: () => actualCostApi.list(params) });
}

export function useCreateActualCost() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => actualCostApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: AC_KEY }) });
}

export function useUpdateActualCost() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => actualCostApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: AC_KEY }) });
}

export function useArchiveActualCost() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => actualCostApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: AC_KEY }) });
}

export function useRestoreActualCost() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => actualCostApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: AC_KEY }) });
}
