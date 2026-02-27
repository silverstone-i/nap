/**
 * @file React Query hooks for phone number data
 * @module nap-client/hooks/usePhoneNumbers
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { phoneNumberApi } from '../services/phoneNumberApi.js';

const PHONE_NUMBERS_KEY = ['phoneNumbers'];

export function usePhoneNumbers(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({
    queryKey: [...PHONE_NUMBERS_KEY, params],
    queryFn: () => phoneNumberApi.list(params),
  });
}

export function usePhoneNumber(id) {
  return useQuery({
    queryKey: [...PHONE_NUMBERS_KEY, id],
    queryFn: () => phoneNumberApi.getById(id),
    enabled: !!id,
  });
}

export function useCreatePhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => phoneNumberApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PHONE_NUMBERS_KEY }),
  });
}

export function useUpdatePhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => phoneNumberApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: PHONE_NUMBERS_KEY }),
  });
}

export function useArchivePhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => phoneNumberApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: PHONE_NUMBERS_KEY }),
  });
}

export function useRestorePhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => phoneNumberApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: PHONE_NUMBERS_KEY }),
  });
}
