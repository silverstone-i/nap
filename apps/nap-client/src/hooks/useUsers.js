/**
 * @file React Query hooks for nap_users data
 * @module nap-client/hooks/useUsers
 *
 * Provides query and mutation hooks that wrap userApi methods.
 * All mutations invalidate the ['nap-users'] query key on success.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '../services/userApi.js';

const USERS_KEY = ['nap-users'];

/** Fetch users with cursor-based pagination. */
export function useUsers(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...USERS_KEY, params],
    queryFn: () => userApi.list(params),
  });
}

/** Fetch a single user by UUID. */
export function useUser(id) {
  return useQuery({
    queryKey: [...USERS_KEY, id],
    queryFn: () => userApi.getById(id),
    enabled: !!id,
  });
}

/** Register a new user. */
export function useRegisterUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => userApi.register(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

/** Update user fields. Expects { filter: {id}, changes: {...} }. */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => userApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

/** Archive (soft-delete) a user. Expects filter: {id} or {email}. */
export function useArchiveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => userApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

/** Restore (reactivate) a user. Expects filter: {id} or {email}. */
export function useRestoreUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => userApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
