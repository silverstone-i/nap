/**
 * @file React Query hooks for tax identifier data
 * @module nap-client/hooks/useTaxIdentifiers
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taxIdentifierApi } from '../services/taxIdentifierApi.js';

const TAX_IDENTIFIERS_KEY = ['taxIdentifiers'];

export function useTaxIdentifiers(params = { limit: 200, includeDeactivated: 'false' }, options = {}) {
  return useQuery({
    queryKey: [...TAX_IDENTIFIERS_KEY, params],
    queryFn: () => taxIdentifierApi.list(params),
    ...options,
  });
}

export function useTaxIdentifier(id) {
  return useQuery({
    queryKey: [...TAX_IDENTIFIERS_KEY, id],
    queryFn: () => taxIdentifierApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateTaxIdentifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => taxIdentifierApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAX_IDENTIFIERS_KEY }),
  });
}

export function useUpdateTaxIdentifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => taxIdentifierApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAX_IDENTIFIERS_KEY }),
  });
}

export function useArchiveTaxIdentifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => taxIdentifierApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAX_IDENTIFIERS_KEY }),
  });
}

export function useRestoreTaxIdentifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => taxIdentifierApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: TAX_IDENTIFIERS_KEY }),
  });
}
