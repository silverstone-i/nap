/**
 * @file React Query hooks for budgets
 * @module nap-client/hooks/useBudgets
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetApi } from '../services/budgetApi.js';

const KEY = ['budgets'];

export function useBudgets(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...KEY, params], queryFn: () => budgetApi.list(params) });
}

export function useBudget(id) {
  return useQuery({ queryKey: [...KEY, id], queryFn: () => budgetApi.getById(id), enabled: !!id });
}

export function useCreateBudget() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => budgetApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useUpdateBudget() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => budgetApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useArchiveBudget() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => budgetApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useCreateBudgetVersion() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => budgetApi.createNewVersion(body), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
