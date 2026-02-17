/**
 * @file React Query hooks for export view data (read-only)
 * @module nap-client/hooks/useViews
 *
 * All view queries use a 30-second staleTime since view data
 * is less dynamic than CRUD entity data.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery } from '@tanstack/react-query';
import { viewApi } from '../services/viewApi.js';

const STALE = 30_000;

export function useViewContacts() {
  return useQuery({
    queryKey: ['view-contacts'],
    queryFn: () => viewApi.contacts(),
    staleTime: STALE,
  });
}

export function useViewAddresses() {
  return useQuery({
    queryKey: ['view-addresses'],
    queryFn: () => viewApi.addresses(),
    staleTime: STALE,
  });
}

export function useViewTemplateCostItems() {
  return useQuery({
    queryKey: ['view-template-cost-items'],
    queryFn: () => viewApi.templateCostItems(),
    staleTime: STALE,
  });
}

export function useViewTemplateTasks() {
  return useQuery({
    queryKey: ['view-template-tasks'],
    queryFn: () => viewApi.templateTasks(),
    staleTime: STALE,
  });
}
