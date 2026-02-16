/**
 * @file React Query hooks for tenant data
 * @module nap-client/hooks/useTenants
 *
 * Provides query and mutation hooks that wrap tenantApi methods.
 * All mutations invalidate the ['tenants'] query key on success.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '../services/tenantApi.js';

const TENANTS_KEY = ['tenants'];

/** Fetch tenants with cursor-based pagination. */
export function useTenants(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...TENANTS_KEY, params],
    queryFn: () => tenantApi.list(params),
  });
}

/** Fetch a single tenant by UUID. */
export function useTenant(id) {
  return useQuery({
    queryKey: [...TENANTS_KEY, id],
    queryFn: () => tenantApi.getById(id),
    enabled: !!id,
  });
}

/** Create a new tenant (with admin user + schema provisioning). */
export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => tenantApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: TENANTS_KEY }),
  });
}

/** Update tenant fields. Expects { filter: {id}, changes: {...} }. */
export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => tenantApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: TENANTS_KEY }),
  });
}

/** Archive (soft-delete) a tenant. Expects filter: {id} or {tenant_code}. */
export function useArchiveTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => tenantApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: TENANTS_KEY }),
  });
}

/** Restore (reactivate) a tenant. Expects filter: {id} or {tenant_code}. */
export function useRestoreTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => tenantApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: TENANTS_KEY }),
  });
}
