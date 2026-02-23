/**
 * @file React Query hooks for client data
 * @module nap-client/hooks/useClients
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../services/clientApi.js';

const CLIENTS_KEY = ['clients'];

export function useClients(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, params],
    queryFn: () => clientApi.list(params),
  });
}

export function useClient(id) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, id],
    queryFn: () => clientApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => clientApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => clientApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

export function useArchiveClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => clientApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

export function useRestoreClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => clientApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}
