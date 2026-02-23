/**
 * @file React Query hooks for tasks master data
 * @module nap-client/hooks/useTasksMaster
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksMasterApi } from '../services/tasksMasterApi.js';

const TASKS_MASTER_KEY = ['tasksMaster'];

export function useTasksMaster(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...TASKS_MASTER_KEY, params],
    queryFn: () => tasksMasterApi.list(params),
  });
}

export function useTaskMaster(id) {
  return useQuery({
    queryKey: [...TASKS_MASTER_KEY, id],
    queryFn: () => tasksMasterApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateTaskMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => tasksMasterApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_MASTER_KEY }),
  });
}

export function useUpdateTaskMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => tasksMasterApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_MASTER_KEY }),
  });
}

export function useArchiveTaskMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => tasksMasterApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_MASTER_KEY }),
  });
}

export function useRestoreTaskMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => tasksMasterApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_MASTER_KEY }),
  });
}
