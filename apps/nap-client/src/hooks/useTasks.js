/**
 * @file React Query hooks for task data
 * @module nap-client/hooks/useTasks
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi } from '../services/taskApi.js';

const TASKS_KEY = ['tasks'];

export function useTasks(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...TASKS_KEY, params],
    queryFn: () => taskApi.list(params),
  });
}

export function useTask(id) {
  return useQuery({
    queryKey: [...TASKS_KEY, id],
    queryFn: () => taskApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => taskApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => taskApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => taskApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => taskApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}
