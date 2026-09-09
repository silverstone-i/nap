/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import {
  projectCompanyOptionsSchema,
  accessOverviewSchema,
  accessChangedSchema,
  effectiveAccessSchema,
  accessChangeSchema,
  platformAccessSchema,
  platformRoleChangeSchema,
  entitlementChangeSchema,
} from '@nap/shared';
import { requestContract } from './request.js';
/** Does: Sends JSON with the existing same-origin client. Called by: administration actions. */
export function jsonRequest(body: unknown, method = 'POST') {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
/** Does: Loads tenant roles and assignment choices. Called by: access page. */
export function getAccess() {
  return requestContract('/api/core/v1/access/overview', accessOverviewSchema);
}
/** Does: Saves a validated tenant access change. Called by: access page. */
export function saveAccess(body: z.infer<typeof accessChangeSchema>) {
  return requestContract(
    '/api/core/v1/access/change',
    accessChangedSchema,
    jsonRequest(body)
  );
}
/** Does: Reads grants supplying one person's access. Called by: effective-access inspector. */
export function getEffective(binding: string) {
  return requestContract(
    `/api/core/v1/access/effective?binding=${encodeURIComponent(binding)}`,
    effectiveAccessSchema
  );
}
/** Does: Loads central role and module grants. Called by: platform access page. */
export function getPlatformAccess() {
  return requestContract(
    '/api/admin-tenancy/v1/control/access-overview',
    platformAccessSchema
  );
}
/** Does: Saves central role or support policy changes. Called by: platform access page. */
export function savePlatformAccess(
  body: z.infer<typeof platformRoleChangeSchema>
) {
  return requestContract(
    '/api/admin-tenancy/v1/control/role-policy',
    accessChangedSchema,
    jsonRequest(body)
  );
}
/** Does: Enables/disables or retries an optional module. Called by: entitlement form. */
export function saveEntitlement(body: z.infer<typeof entitlementChangeSchema>) {
  return requestContract(
    '/api/admin-tenancy/v1/control/entitlement',
    z.object({
      version: z.literal(1),
      data: z.object({ id: z.uuid(), projected: z.boolean() }),
    }),
    jsonRequest(body)
  );
}
/** Does: Describes the basic company/project view. Used by: scope-record pages. */
export const scopeRecordSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  company_id: z.uuid().optional(),
});
/** Does: Reads one bounded company/project page. Called by: scope-record pages. */
export function getRecords(projects: boolean, cursor?: string) {
  return requestContract(
    `/api/${projects ? 'projects/v1/projects' : 'core/v1/companies'}/?size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    z.object({
      version: z.literal(1),
      data: z.array(scopeRecordSchema),
      page: z.object({
        total: z.number(),
        size: z.number(),
        cursor: z.string().optional(),
      }),
    })
  );
}
/** Does: Creates, updates or archives a company/project. Called by: scope-record forms. */
export function saveRecord(
  projects: boolean,
  body: unknown,
  operation: 'create' | 'update' | 'archive'
) {
  const path = `/api/${projects ? 'projects/v1/projects' : 'core/v1/companies'}`;
  return requestContract(
    path + (operation === 'create' ? '/' : `/${operation}`),
    z.object({
      version: z.literal(1),
      data: z.union([scopeRecordSchema, z.array(scopeRecordSchema)]),
    }),
    jsonRequest(
      body,
      operation === 'create'
        ? 'POST'
        : operation === 'update'
          ? 'PUT'
          : 'DELETE'
    )
  );
}

/** Does: Reads company references authorized for project creation. Called by: the project form. */
export function getProjectCompanies() {
  return requestContract(
    '/api/projects/v1/projects/company-options',
    projectCompanyOptionsSchema
  );
}
