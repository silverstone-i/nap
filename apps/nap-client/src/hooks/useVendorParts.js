/**
 * @file React Query hooks for vendor parts
 * @module nap-client/hooks/useVendorParts
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendorPartApi } from '../services/vendorPartApi.js';

const KEY = ['vendorParts'];

export function useVendorParts(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...KEY, params], queryFn: () => vendorPartApi.list(params) });
}

export function useCreateVendorPart() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => vendorPartApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useUpdateVendorPart() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => vendorPartApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useArchiveVendorPart() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => vendorPartApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
