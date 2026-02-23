/**
 * @file React Query hooks for cost item data
 * @module nap-client/hooks/useCostItems
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { costItemApi } from '../services/costItemApi.js';

const COST_ITEMS_KEY = ['costItems'];

export function useCostItems(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...COST_ITEMS_KEY, params],
    queryFn: () => costItemApi.list(params),
  });
}

export function useCostItem(id) {
  return useQuery({
    queryKey: [...COST_ITEMS_KEY, id],
    queryFn: () => costItemApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateCostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => costItemApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: COST_ITEMS_KEY }),
  });
}

export function useUpdateCostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => costItemApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: COST_ITEMS_KEY }),
  });
}

export function useArchiveCostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => costItemApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: COST_ITEMS_KEY }),
  });
}

export function useRestoreCostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => costItemApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: COST_ITEMS_KEY }),
  });
}
