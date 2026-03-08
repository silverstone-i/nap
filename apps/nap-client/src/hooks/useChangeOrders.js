/**
 * @file React Query hooks for change order data
 * @module nap-client/hooks/useChangeOrders
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { changeOrderApi } from '../services/changeOrderApi.js';

const CHANGE_ORDERS_KEY = ['changeOrders'];

export function useChangeOrders(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...CHANGE_ORDERS_KEY, params],
    queryFn: () => changeOrderApi.list(params),
  });
}

export function useChangeOrder(id) {
  return useQuery({
    queryKey: [...CHANGE_ORDERS_KEY, id],
    queryFn: () => changeOrderApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => changeOrderApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHANGE_ORDERS_KEY }),
  });
}

export function useUpdateChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => changeOrderApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHANGE_ORDERS_KEY }),
  });
}

export function useArchiveChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => changeOrderApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHANGE_ORDERS_KEY }),
  });
}

export function useRestoreChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => changeOrderApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHANGE_ORDERS_KEY }),
  });
}
