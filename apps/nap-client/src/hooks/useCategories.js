/**
 * @file React Query hooks for cost categories
 * @module nap-client/hooks/useCategories
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryApi } from '../services/categoryApi.js';

const KEY = ['categories'];

export function useCategories(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...KEY, params], queryFn: () => categoryApi.list(params) });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => categoryApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => categoryApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => categoryApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
