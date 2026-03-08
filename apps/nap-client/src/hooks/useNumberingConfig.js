/**
 * @file React Query hooks for numbering configuration
 * @module nap-client/hooks/useNumberingConfig
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { numberingConfigApi } from '../services/numberingConfigApi.js';

const KEY = ['numberingConfig'];

/** Fetch all numbering config rows (one per entity type). */
export function useNumberingConfig(params = { limit: 50 }) {
  return useQuery({
    queryKey: [...KEY, params],
    queryFn: () => numberingConfigApi.list(params),
  });
}

/** Update a numbering config row. Expects { filter: {id}, changes: {...} }. */
export function useUpdateNumberingConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => numberingConfigApi.update(filter, changes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Enabling numbering triggers a server-side backfill of entity codes,
      // so invalidate entity caches to pick up the new values.
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['vendors'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
