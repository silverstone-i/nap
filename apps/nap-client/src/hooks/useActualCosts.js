/**
 * @file React Query hooks for actual costs
 * @module nap-client/hooks/useActualCosts
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { actualCostApi } from '../services/actualCostApi.js';

const KEY = ['actualCosts'];

export function useActualCosts(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...KEY, params], queryFn: () => actualCostApi.list(params) });
}

export function useCreateActualCost() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => actualCostApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useUpdateActualCost() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => actualCostApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useArchiveActualCost() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => actualCostApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
