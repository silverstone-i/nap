/**
 * @file React Query hooks for inter-company data
 * @module nap-client/hooks/useInterCompanies
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { interCompanyApi } from '../services/interCompanyApi.js';

const IC_KEY = ['inter-companies'];

export function useInterCompanies(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...IC_KEY, params],
    queryFn: () => interCompanyApi.list(params),
  });
}

export function useInterCompany(id) {
  return useQuery({
    queryKey: [...IC_KEY, id],
    queryFn: () => interCompanyApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateInterCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => interCompanyApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: IC_KEY }),
  });
}

export function useUpdateInterCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => interCompanyApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: IC_KEY }),
  });
}

export function useArchiveInterCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => interCompanyApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: IC_KEY }),
  });
}

export function useRestoreInterCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => interCompanyApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: IC_KEY }),
  });
}
