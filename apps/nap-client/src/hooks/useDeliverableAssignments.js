/**
 * @file React Query hooks for deliverable assignments
 * @module nap-client/hooks/useDeliverableAssignments
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deliverableAssignmentApi } from '../services/deliverableAssignmentApi.js';

const KEY = ['deliverableAssignments'];

export function useDeliverableAssignments(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...KEY, params], queryFn: () => deliverableAssignmentApi.list(params) });
}

export function useCreateDeliverableAssignment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => deliverableAssignmentApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function useUpdateDeliverableAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => deliverableAssignmentApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useArchiveDeliverableAssignment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => deliverableAssignmentApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
