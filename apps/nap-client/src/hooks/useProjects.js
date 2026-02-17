/**
 * @file React Query hooks for project-family data
 * @module nap-client/hooks/useProjects
 *
 * Provides query and mutation hooks for projects, units, tasks, cost items, change orders.
 * All mutations invalidate their respective query keys on success.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectApi, unitApi, taskApi, costItemApi, changeOrderApi } from '../services/projectApi.js';

/* ── helpers ─────────────────────────────────────────────────── */

function useCrud(key, api, listParams = { limit: 500, includeDeactivated: 'true' }) {
  const qc = useQueryClient();
  const queryKey = [key];

  const list = useQuery({ queryKey: [...queryKey, listParams], queryFn: () => api.list(listParams) });
  const create = useMutation({ mutationFn: (body) => api.create(body), onSuccess: () => qc.invalidateQueries({ queryKey }) });
  const update = useMutation({ mutationFn: ({ filter, changes }) => api.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey }) });
  const archive = useMutation({ mutationFn: (filter) => api.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey }) });
  const restore = useMutation({ mutationFn: (filter) => api.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey }) });

  return { list, create, update, archive, restore };
}

/* ── Projects ────────────────────────────────────────────────── */

const PROJECTS_KEY = ['projects'];

export function useProjects(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...PROJECTS_KEY, params], queryFn: () => projectApi.list(params) });
}

export function useProject(id) {
  return useQuery({ queryKey: [...PROJECTS_KEY, id], queryFn: () => projectApi.getById(id), enabled: !!id });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => projectApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }) });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => projectApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }) });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => projectApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }) });
}

export function useRestoreProject() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => projectApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }) });
}

/* ── Units ────────────────────────────────────────────────────── */

export function useUnits(params) { return useCrud('units', unitApi, params); }

/* ── Tasks ────────────────────────────────────────────────────── */

export function useTasks(params) { return useCrud('tasks', taskApi, params); }

/* ── Cost Items ──────────────────────────────────────────────── */

export function useCostItems(params) { return useCrud('cost-items', costItemApi, params); }

/* ── Change Orders ───────────────────────────────────────────── */

const CO_KEY = ['change-orders'];

export function useChangeOrders(params = { limit: 500, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...CO_KEY, params], queryFn: () => changeOrderApi.list(params) });
}

export function useCreateChangeOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => changeOrderApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: CO_KEY }) });
}

export function useUpdateChangeOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ filter, changes }) => changeOrderApi.update(filter, changes), onSuccess: () => qc.invalidateQueries({ queryKey: CO_KEY }) });
}

export function useArchiveChangeOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => changeOrderApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: CO_KEY }) });
}

export function useRestoreChangeOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => changeOrderApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: CO_KEY }) });
}
