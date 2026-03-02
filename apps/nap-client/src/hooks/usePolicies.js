/**
 * @file React Query hooks for RBAC policies and policy catalog
 * @module nap-client/hooks/usePolicies
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { policyApi, policyCatalogApi } from '../services/policyApi.js';

const POLICIES_KEY = ['policies'];
const CATALOG_KEY = ['policy-catalog'];

export function usePolicyCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => policyCatalogApi.list({ limit: 200 }),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePoliciesForRole(roleId) {
  return useQuery({
    queryKey: [...POLICIES_KEY, roleId],
    queryFn: () => policyApi.listForRole(roleId),
    enabled: !!roleId,
  });
}

export function useSyncPolicies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, policies }) => policyApi.syncForRole(roleId, policies),
    onSuccess: (_data, { roleId }) => {
      qc.invalidateQueries({ queryKey: [...POLICIES_KEY, roleId] });
    },
  });
}
