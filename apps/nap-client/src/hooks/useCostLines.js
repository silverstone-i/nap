/**
 * @file React Query hooks for cost lines
 * @module nap-client/hooks/useCostLines
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { costLineApi } from '../services/costLineApi.js';

const KEY = ['costLines'];

export function useCostLines(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...KEY, params], queryFn: () => costLineApi.list(params) });
}

export function useCreateCostLine() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => costLineApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useUpdateCostLine() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => costLineApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useArchiveCostLine() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => costLineApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
