/**
 * @file React Query hooks for deliverables
 * @module nap-client/hooks/useDeliverables
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deliverableApi } from '../services/deliverableApi.js';

const KEY = ['deliverables'];

export function useDeliverables(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...KEY, params], queryFn: () => deliverableApi.list(params) });
}

export function useDeliverable(id) {
  return useQuery({ queryKey: [...KEY, id], queryFn: () => deliverableApi.getById(id), enabled: !!id });
}

export function useCreateDeliverable() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => deliverableApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useUpdateDeliverable() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => deliverableApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useArchiveDeliverable() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => deliverableApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useRestoreDeliverable() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => deliverableApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
