/**
 * @file React Query hooks for country reference data
 * @module nap-client/hooks/useCountries
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useQuery } from '@tanstack/react-query';
import { countryApi } from '../services/countryApi.js';

const COUNTRIES_KEY = ['countries'];

export function useCountries(params = { limit: 300, is_active: 'true' }, options = {}) {
  return useQuery({
    queryKey: [...COUNTRIES_KEY, params],
    queryFn: () => countryApi.list(params),
    staleTime: 1000 * 60 * 60, // 1 hour — reference data rarely changes
    ...options,
  });
}
