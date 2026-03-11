/**
 * @file React Query hooks for address data
 * @module nap-client/hooks/useAddresses
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { addressApi } from '../services/addressApi.js';

const ADDRESSES_KEY = ['addresses'];

export function useAddresses(params = { limit: 200, includeDeactivated: 'true' }, options = {}) {
  return useQuery({
    queryKey: [...ADDRESSES_KEY, params],
    queryFn: () => addressApi.list(params),
    ...options,
  });
}

export function useCreateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => addressApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADDRESSES_KEY }),
  });
}

export function useUpdateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => addressApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADDRESSES_KEY }),
  });
}

export function useArchiveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => addressApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADDRESSES_KEY }),
  });
}

export function useRestoreAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => addressApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADDRESSES_KEY }),
  });
}
