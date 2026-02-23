/**
 * @file React Query hooks for task group data
 * @module nap-client/hooks/useTaskGroups
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskGroupApi } from '../services/taskGroupApi.js';

const TASK_GROUPS_KEY = ['taskGroups'];

export function useTaskGroups(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...TASK_GROUPS_KEY, params],
    queryFn: () => taskGroupApi.list(params),
  });
}

export function useTaskGroup(id) {
  return useQuery({
    queryKey: [...TASK_GROUPS_KEY, id],
    queryFn: () => taskGroupApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateTaskGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => taskGroupApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASK_GROUPS_KEY }),
  });
}

export function useUpdateTaskGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => taskGroupApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASK_GROUPS_KEY }),
  });
}

export function useArchiveTaskGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => taskGroupApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASK_GROUPS_KEY }),
  });
}

export function useRestoreTaskGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => taskGroupApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASK_GROUPS_KEY }),
  });
}
