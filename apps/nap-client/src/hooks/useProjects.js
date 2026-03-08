/**
 * @file React Query hooks for project data
 * @module nap-client/hooks/useProjects
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectApi } from '../services/projectApi.js';

const PROJECTS_KEY = ['projects'];

export function useProjects(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, params],
    queryFn: () => projectApi.list(params),
  });
}

export function useProject(id) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, id],
    queryFn: () => projectApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => projectApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => projectApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => projectApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useRestoreProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => projectApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}
