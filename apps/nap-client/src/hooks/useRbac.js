/**
 * @file React Query hooks for RBAC data (roles, members, policies, catalog)
 * @module nap-client/hooks/useRbac
 *
 * Provides query and mutation hooks that wrap rbacApi methods.
 * Mutations invalidate the appropriate query keys on success.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesApi, roleMembersApi, policiesApi, policyCatalogApi } from '../services/rbacApi.js';

const ROLES_KEY = ['roles'];
const MEMBERS_KEY = ['role-members'];
const POLICIES_KEY = ['policies'];
const CATALOG_KEY = ['policy-catalog'];

// ── Roles ───────────────────────────────────────────────────────────────────

/** Fetch all roles with cursor-based pagination. */
export function useRoles(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...ROLES_KEY, params],
    queryFn: () => rolesApi.list(params),
  });
}

/** Fetch a single role by UUID. */
export function useRole(id) {
  return useQuery({
    queryKey: [...ROLES_KEY, id],
    queryFn: () => rolesApi.getById(id),
    enabled: !!id,
  });
}

/** Create a new role. */
export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => rolesApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

/** Update role fields. Expects { filter: {id}, changes: {...} }. */
export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => rolesApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

/** Archive (soft-delete) a role. Expects filter: {id}. */
export function useArchiveRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => rolesApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

/** Restore (reactivate) a role. Expects filter: {id}. */
export function useRestoreRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => rolesApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

// ── Role Members ────────────────────────────────────────────────────────────

/** Fetch members for a specific role. */
export function useRoleMembers(roleId) {
  return useQuery({
    queryKey: [...MEMBERS_KEY, roleId],
    queryFn: () => roleMembersApi.list({ role_id: roleId }),
    enabled: !!roleId,
  });
}

/** Sync all members for a role. Expects { role_id, user_ids }. */
export function useSyncRoleMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => roleMembersApi.sync(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEMBERS_KEY });
      qc.invalidateQueries({ queryKey: ROLES_KEY });
    },
  });
}

/** Remove a single member from a role. Expects { role_id, user_id }. */
export function useRemoveRoleMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params) => roleMembersApi.remove(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEMBERS_KEY });
      qc.invalidateQueries({ queryKey: ROLES_KEY });
    },
  });
}

// ── Policies ────────────────────────────────────────────────────────────────

/** Fetch policies for a specific role. */
export function usePolicies(roleId) {
  return useQuery({
    queryKey: [...POLICIES_KEY, roleId],
    queryFn: () => policiesApi.list({ role_id: roleId }),
    enabled: !!roleId,
  });
}

/** Sync all policies for a role. Expects { role_id, policies }. */
export function useSyncPolicies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => policiesApi.syncForRole(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POLICIES_KEY });
      qc.invalidateQueries({ queryKey: ROLES_KEY });
    },
  });
}

// ── Policy Catalog ──────────────────────────────────────────────────────────

/** Fetch the full policy catalog (cached aggressively — reference data). */
export function usePolicyCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => policyCatalogApi.list({ limit: 500 }),
    staleTime: Infinity,
  });
}
