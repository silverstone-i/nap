/**
 * @file React Query hooks for BOM module (catalog SKUs, vendor SKUs, vendor pricing)
 * @module nap-client/hooks/useBom
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogSkuApi, vendorSkuApi, vendorPricingApi } from '../services/bomApi.js';

/* ---- Catalog SKUs ---- */
const CATALOG_KEY = ['catalogSkus'];

export function useCatalogSkus(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...CATALOG_KEY, params], queryFn: () => catalogSkuApi.list(params) });
}

export function useCatalogSku(id) {
  return useQuery({ queryKey: [...CATALOG_KEY, id], queryFn: () => catalogSkuApi.getById(id), enabled: !!id });
}

export function useCreateCatalogSku() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => catalogSkuApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: CATALOG_KEY }) });
}

export function useUpdateCatalogSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => catalogSkuApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATALOG_KEY }),
  });
}

export function useArchiveCatalogSku() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => catalogSkuApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: CATALOG_KEY }) });
}

export function useRestoreCatalogSku() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => catalogSkuApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: CATALOG_KEY }) });
}

export function useRefreshCatalogEmbeddings() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => catalogSkuApi.refreshEmbeddings(), onSuccess: () => qc.invalidateQueries({ queryKey: CATALOG_KEY }) });
}

/* ---- Vendor SKUs ---- */
const VENDOR_KEY = ['vendorSkus'];
const UNMATCHED_KEY = ['vendorSkus', 'unmatched'];

export function useVendorSkus(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...VENDOR_KEY, params], queryFn: () => vendorSkuApi.list(params) });
}

export function useVendorSku(id) {
  return useQuery({ queryKey: [...VENDOR_KEY, id], queryFn: () => vendorSkuApi.getById(id), enabled: !!id });
}

export function useUnmatchedVendorSkus() {
  return useQuery({ queryKey: UNMATCHED_KEY, queryFn: () => vendorSkuApi.getUnmatched() });
}

export function useCreateVendorSku() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body) => vendorSkuApi.create(body), onSuccess: () => qc.invalidateQueries({ queryKey: VENDOR_KEY }) });
}

export function useUpdateVendorSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => vendorSkuApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: VENDOR_KEY }),
  });
}

export function useArchiveVendorSku() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => vendorSkuApi.archive(filter), onSuccess: () => qc.invalidateQueries({ queryKey: VENDOR_KEY }) });
}

export function useRestoreVendorSku() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (filter) => vendorSkuApi.restore(filter), onSuccess: () => qc.invalidateQueries({ queryKey: VENDOR_KEY }) });
}

export function useMatchVendorSku() {
  return useMutation({ mutationFn: (body) => vendorSkuApi.match(body) });
}

export function useAutoMatchVendorSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => vendorSkuApi.autoMatch(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VENDOR_KEY });
      qc.invalidateQueries({ queryKey: UNMATCHED_KEY });
    },
  });
}

export function useBatchMatchVendorSkus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => vendorSkuApi.batchMatch(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VENDOR_KEY });
      qc.invalidateQueries({ queryKey: UNMATCHED_KEY });
    },
  });
}

export function useRefreshVendorEmbeddings() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => vendorSkuApi.refreshEmbeddings(), onSuccess: () => qc.invalidateQueries({ queryKey: VENDOR_KEY }) });
}

/* ---- Vendor Pricing ---- */
const PRICING_KEY = ['vendorPricing'];

export function useVendorPricing(params = { limit: 200, includeDeactivated: 'true' }) {
  return useQuery({ queryKey: [...PRICING_KEY, params], queryFn: () => vendorPricingApi.list(params) });
}

export function useCreateVendorPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => vendorPricingApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICING_KEY }),
  });
}

export function useUpdateVendorPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filter, changes }) => vendorPricingApi.update(filter, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICING_KEY }),
  });
}

export function useArchiveVendorPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => vendorPricingApi.archive(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICING_KEY }),
  });
}

export function useRestoreVendorPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter) => vendorPricingApi.restore(filter),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICING_KEY }),
  });
}
