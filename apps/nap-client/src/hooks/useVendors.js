/**
 * @file React Query hooks for vendor data
 * @module nap-client/hooks/useVendors
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendorApi } from '../services/vendorApi.js';

const VENDORS_KEY = ['vendors'];

export function useVendors(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...VENDORS_KEY, params],
    queryFn: () => vendorApi.list(params),
  });
}

export function useVendor(id) {
  return useQuery({
    queryKey: [...VENDORS_KEY, id],
    queryFn: () => vendorApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => vendorApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDORS_KEY }),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => vendorApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDORS_KEY }),
  });
}

export function useArchiveVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => vendorApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDORS_KEY }),
  });
}

export function useRestoreVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => vendorApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDORS_KEY }),
  });
}
