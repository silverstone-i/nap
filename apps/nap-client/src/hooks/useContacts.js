/**
 * @file React Query hooks for contact data
 * @module nap-client/hooks/useContacts
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contactApi } from '../services/contactApi.js';

const CONTACTS_KEY = ['contacts'];

export function useContacts(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...CONTACTS_KEY, params],
    queryFn: () => contactApi.list(params),
  });
}

export function useContact(id) {
  return useQuery({
    queryKey: [...CONTACTS_KEY, id],
    queryFn: () => contactApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => contactApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => contactApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });
}

export function useArchiveContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => contactApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });
}

export function useRestoreContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => contactApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });
}
