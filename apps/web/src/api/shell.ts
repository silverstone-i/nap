/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { navigationResponseSchema, identityResponseSchema } from '@nap/shared';
import { requestContract } from './request.js';
/**
 * Does: Reads current employee navigation eligibility.
 * Called by: the tenant shell on entry and refresh.
 */
export function getNavigation() {
  return requestContract(
    '/api/core/v1/identity/navigation',
    navigationResponseSchema
  );
}
/**
 * Does: Reads the caller's employee or an explicitly controlled target.
 * Called by: Employees after the shell establishes tenant scope.
 */
export function getEmployee(record?: string) {
  return requestContract(
    '/api/core/v1/identity/profile' +
      (record ? `?kind=employee&record=${encodeURIComponent(record)}` : ''),
    identityResponseSchema
  );
}
