/**
 * @file React Query hooks for tenant-scope employees
 * @module nap-client/hooks/useEmployees
 *
 * Provides query and mutation hooks that wrap employeeApi methods.
 * All mutations invalidate the ['employees'] query key on success.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeApi } from '../services/employeeApi.js';

const EMPLOYEES_KEY = ['employees'];

/** Fetch employees with cursor-based pagination. */
export function useEmployees(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...EMPLOYEES_KEY, params],
    queryFn: () => employeeApi.list(params),
  });
}

/** Fetch a single employee by UUID. */
export function useEmployee(id) {
  return useQuery({
    queryKey: [...EMPLOYEES_KEY, id],
    queryFn: () => employeeApi.getById(id),
    enabled: !!id,
  });
}

/** Create a new employee. */
export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => employeeApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

/** Update employee fields. Expects { filter: {id}, changes: {...} }. */
export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => employeeApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

/** Archive (soft-delete) an employee. Expects filter: {id}. */
export function useArchiveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => employeeApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

/** Restore (reactivate) an employee. Expects filter: {id}. */
export function useRestoreEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => employeeApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}
