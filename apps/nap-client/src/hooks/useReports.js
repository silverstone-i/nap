/**
 * @file React Query hooks for report data (read-only)
 * @module nap-client/hooks/useReports
 *
 * All report queries use a 30-second staleTime since report data
 * is less dynamic than CRUD entity data.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useQuery } from '@tanstack/react-query';
import { reportApi } from '../services/reportApi.js';

const STALE = 30_000;

/* ── Profitability ───────────────────────────────────────────── */

export function useProjectProfitability() {
  return useQuery({
    queryKey: ['report-profitability'],
    queryFn: () => reportApi.profitabilityAll(),
    staleTime: STALE,
  });
}

export function useProjectProfitabilityById(projectId) {
  return useQuery({
    queryKey: ['report-profitability', projectId],
    queryFn: () => reportApi.profitabilityByProject(projectId),
    enabled: !!projectId,
    staleTime: STALE,
  });
}

/* ── Cashflow ────────────────────────────────────────────────── */

export function useProjectCashflow(projectId) {
  return useQuery({
    queryKey: ['report-cashflow', projectId],
    queryFn: () => reportApi.cashflowByProject(projectId),
    enabled: !!projectId,
    staleTime: STALE,
  });
}

export function useCashflowForecast(projectId) {
  return useQuery({
    queryKey: ['report-cashflow-forecast', projectId],
    queryFn: () => reportApi.cashflowForecast(projectId),
    enabled: !!projectId,
    staleTime: STALE,
  });
}

/* ── Cost Breakdown ──────────────────────────────────────────── */

export function useCostBreakdown(projectId) {
  return useQuery({
    queryKey: ['report-cost-breakdown', projectId],
    queryFn: () => reportApi.costBreakdownByProject(projectId),
    enabled: !!projectId,
    staleTime: STALE,
  });
}

/* ── Aging ───────────────────────────────────────────────────── */

export function useArAging() {
  return useQuery({
    queryKey: ['report-ar-aging'],
    queryFn: () => reportApi.arAging(),
    staleTime: STALE,
  });
}

export function useApAging() {
  return useQuery({
    queryKey: ['report-ap-aging'],
    queryFn: () => reportApi.apAging(),
    staleTime: STALE,
  });
}

/* ── Company Cashflow ────────────────────────────────────────── */

export function useCompanyCashflow() {
  return useQuery({
    queryKey: ['report-company-cashflow'],
    queryFn: () => reportApi.companyCashflow(),
    staleTime: STALE,
  });
}

/* ── Margin Analysis ─────────────────────────────────────────── */

export function useMarginAnalysis(params = {}) {
  return useQuery({
    queryKey: ['report-margin-analysis', params],
    queryFn: () => reportApi.marginAnalysis(params),
    staleTime: STALE,
  });
}
