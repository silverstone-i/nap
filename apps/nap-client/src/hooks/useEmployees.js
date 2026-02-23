/**
 * @file React Query hooks for employee data
 * @module nap-client/hooks/useEmployees
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeApi } from '../services/employeeApi.js';

const EMPLOYEES_KEY = ['employees'];

export function useEmployees(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...EMPLOYEES_KEY, params],
    queryFn: () => employeeApi.list(params),
  });
}

export function useEmployee(id) {
  return useQuery({
    queryKey: [...EMPLOYEES_KEY, id],
    queryFn: () => employeeApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => employeeApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => employeeApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useArchiveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => employeeApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useRestoreEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => employeeApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}
