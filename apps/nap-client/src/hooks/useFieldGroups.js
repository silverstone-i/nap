/**
 * @file React Query hooks for RBAC Layer 4 field group definitions and grants
 * @module nap-client/hooks/useFieldGroups
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fieldGroupApi } from '../services/fieldGroupApi.js';

const DEFINITIONS_KEY = ['field-group-definitions'];
const GRANTS_KEY = ['field-group-grants'];

export function useFieldGroupDefinitions() {
  return useQuery({
    queryKey: DEFINITIONS_KEY,
    queryFn: () => fieldGroupApi.listDefinitions({ limit: 200 }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFieldGroupGrantsForRole(roleId) {
  return useQuery({
    queryKey: [...GRANTS_KEY, roleId],
    queryFn: () => fieldGroupApi.listGrantsForRole(roleId),
    enabled: !!roleId,
  });
}

export function useSyncFieldGroupGrants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, grantIds }) => fieldGroupApi.syncGrantsForRole(roleId, grantIds),
    onSuccess: (_data, { roleId }) => {
      qc.invalidateQueries({ queryKey: [...GRANTS_KEY, roleId] });
    },
  });
}

export function useCreateFieldGroupDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => fieldGroupApi.createDefinition(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  });
}

export function useUpdateFieldGroupDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }) => fieldGroupApi.updateDefinition(id, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  });
}

export function useDeleteFieldGroupDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => fieldGroupApi.archiveDefinition(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFINITIONS_KEY }),
  });
}
