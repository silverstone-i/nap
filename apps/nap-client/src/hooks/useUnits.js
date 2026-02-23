/**
 * @file React Query hooks for unit data
 * @module nap-client/hooks/useUnits
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unitApi } from '../services/unitApi.js';

const UNITS_KEY = ['units'];

export function useUnits(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...UNITS_KEY, params],
    queryFn: () => unitApi.list(params),
  });
}

export function useUnit(id) {
  return useQuery({
    queryKey: [...UNITS_KEY, id],
    queryFn: () => unitApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => unitApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: UNITS_KEY }),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => unitApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: UNITS_KEY }),
  });
}

export function useArchiveUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => unitApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: UNITS_KEY }),
  });
}

export function useRestoreUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => unitApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: UNITS_KEY }),
  });
}
