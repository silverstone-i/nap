/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import { successResponseSchema } from './envelopes.js';
/** Does: Names supported assignment boundaries. Used by: role forms and authorization. */
export const scopeKinds = [
  'self',
  'companies',
  'projects',
  'all_companies',
  'all_projects',
  'company_projects',
  'tenant',
] as const;
/** Does: Defines a positive sensitive-field permission. Used by: role contracts. */
export const fieldGrantSchema = z.strictObject({
  resource: z.string(),
  group: z.string(),
  view: z.boolean(),
  edit: z.boolean(),
});
/** Does: Defines administrator role changes. Used by: access API and forms. */
export const accessChangeSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('role'),
    id: z.uuid().optional(),
    code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    name: z.string().trim().min(1).max(128),
    capabilities: z.array(z.string()).max(300),
    fields: z.array(fieldGrantSchema).max(100),
  }),
  z.strictObject({ operation: z.literal('archive-role'), id: z.uuid() }),
  z.strictObject({
    operation: z.literal('assign'),
    roleId: z.uuid(),
    bindingId: z.uuid(),
    scope: z.enum(scopeKinds),
    targets: z.array(z.uuid()).max(1000),
  }),
  z.strictObject({ operation: z.literal('revoke'), id: z.uuid() }),
]);
/** Does: Describes one visible role definition. Used by: access overview. */
export const roleViewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  permanent: z.boolean(),
  capabilities: z.array(z.string()),
  fields: z.array(fieldGrantSchema),
});
/** Does: Describes a scoped role assignment. Used by: overview and explanations. */
export const assignmentViewSchema = z.object({
  id: z.uuid(),
  role_id: z.uuid(),
  binding_id: z.uuid(),
  scope: z.enum(scopeKinds),
  targets: z.array(z.uuid()),
});
/** Does: Lists registered resource actions and field groups. Used by: permission editors. */
export const resourceCatalogSchema = z.array(
  z.object({
    resource: z.string(),
    label: z.string(),
    scopes: z.array(z.enum(scopeKinds)),
    capabilities: z.array(z.string()),
    fields: z.array(
      z.object({ name: z.string(), columns: z.array(z.string()) })
    ),
  })
);
/** Does: Describes tenant access administration data. Used by: API and web. */
export const accessOverviewSchema = successResponseSchema(
  z.object({
    roles: z.array(roleViewSchema),
    assignments: z.array(assignmentViewSchema),
    users: z.array(
      z.object({
        id: z.uuid(),
        portal_user_id: z.uuid(),
        name: z.string(),
        status: z.string(),
      })
    ),
    companies: z.array(
      z.object({ id: z.uuid(), code: z.string(), name: z.string() })
    ),
    projects: z.array(
      z.object({
        id: z.uuid(),
        code: z.string(),
        name: z.string(),
        company_id: z.uuid(),
      })
    ),
    catalog: resourceCatalogSchema,
  })
);
/** Does: Describes access granted by individual assignments. Used by: effective-access UI. */
export const effectiveAccessSchema = successResponseSchema(
  z.array(assignmentViewSchema.extend({ role: roleViewSchema }))
);
/** Does: Acknowledges an audited access change. Used by: mutation replies. */
export const accessChangedSchema = successResponseSchema(
  z.object({ id: z.uuid() })
);
/** Does: Defines the tenant-module enable/retry command. Used by: operator API. */
export const entitlementChangeSchema = z.strictObject({
  tenant: z.uuid(),
  module: z.literal('projects'),
  enabled: z.boolean(),
});
/** Does: Defines central role and shared support-policy changes. Used by: operator API. */
export const platformRoleChangeSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('platform-role'),
    user: z.uuid(),
    role: z.enum(['platform_admin', 'support']),
    enabled: z.boolean(),
  }),
  z.strictObject({
    operation: z.literal('support-policy'),
    permissions: z.array(z.string()).max(100),
  }),
]);
/** Does: Describes current central role and entitlement state. Used by: operator UI. */
export const platformAccessSchema = successResponseSchema(
  z.object({
    roles: z.array(
      z.object({ id: z.uuid(), portal_user_id: z.uuid(), role: z.string() })
    ),
    support: z.array(z.string()),
    entitlements: z.array(
      z.object({
        tenant_id: z.uuid(),
        module: z.string(),
        enabled: z.boolean(),
        revision: z.number(),
      })
    ),
  })
);

/** Does: Describes authorized project parent choices. Used by: project creation API and picker. */
export const projectCompanyOptionsSchema = successResponseSchema(
  z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string() }))
);
