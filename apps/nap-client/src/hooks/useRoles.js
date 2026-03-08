/**
 * @file React Query hooks for tenant-scope RBAC roles
 * @module nap-client/hooks/useRoles
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roleApi } from '../services/roleApi.js';

const ROLES_KEY = ['roles'];

export function useRoles(params = { limit: 200 }) {
  return useQuery({
    queryKey: [...ROLES_KEY, params],
    queryFn: () => roleApi.list(params),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => roleApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => roleApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}
