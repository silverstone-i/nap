/**
 * @file React Query hooks for activities
 * @module nap-client/hooks/useActivities
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activityApi } from '../services/activityApi.js';

const KEY = ['activities'];

export function useActivities(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...KEY, params], queryFn: () => activityApi.list(params) });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => activityApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => activityApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useArchiveActivity() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => activityApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
