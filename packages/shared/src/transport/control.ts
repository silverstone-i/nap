/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { successResponseSchema } from './envelopes.js';

/** Does: Names explicit central route permissions. Used by: grants, middleware and operator UI. */
export const platformPermissions = [
  'admin-tenancy::control::role-policy',
  'admin-tenancy::control::access-overview',
  'admin-tenancy::control::entitlement',
  'admin-tenancy::control::overview',
  'admin-tenancy::control::registry',
  'admin-tenancy::control::cell-readiness',
  'admin-tenancy::control::provision',
  'admin-tenancy::control::members',
  'admin-tenancy::control::grants',
  'admin-tenancy::control::audit',
  'admin-tenancy::control::access',
  'admin-tenancy::control::impersonate',
] as const;
/** Does: Validates a central permission. Used by: grant operations. */
export const platformPermissionSchema = z.enum(platformPermissions);
/** Does: Defines the bounded operator commands. Used by: control API and forms. */
export const controlBodySchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('cell'),
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(128),
    enabled: z.boolean().default(true),
  }),
  z.strictObject({
    operation: z.literal('tenant'),
    code: z.string().trim().min(1).max(16),
    name: z.string().trim().min(1).max(128),
    tier: z.enum(['starter', 'growth', 'enterprise']).default('starter'),
    cell: z.uuid(),
  }),
  z.strictObject({
    operation: z.literal('tenant-update'),
    target: z.uuid(),
    tier: z.enum(['starter', 'growth', 'enterprise']),
    cell: z.uuid(),
  }),
  z.strictObject({
    operation: z.literal('status'),
    target: z.uuid(),
    status: z.enum(['active', 'suspended']),
    reason: z.string().trim().min(1).max(512),
  }),
  z.strictObject({
    operation: z.literal('grant'),
    user: z.uuid(),
    role: z.enum(['package_admin', 'support']),
    permission: platformPermissionSchema,
    enabled: z.boolean(),
  }),
  z.strictObject({
    operation: z.literal('member'),
    target: z.uuid(),
    kind: z.enum(['employee', 'client', 'vendor']),
    name: z.string().trim().min(1).max(128),
    email: z
      .email()
      .max(128)
      .transform(s => s.toLowerCase()),
    password: z.string().min(12).max(128).optional(),
  }),
  z.strictObject({
    operation: z.literal('revoke'),
    membership: z.uuid(),
    reason: z.string().trim().min(1).max(512),
  }),
  z.strictObject({
    operation: z.literal('retry'),
    job: z.uuid(),
    name: z.string().trim().min(1).max(128).optional(),
  }),
  z.strictObject({
    operation: z.literal('activate'),
    target: z.uuid(),
    administrator: z.uuid().optional(),
  }),
  z.strictObject({ operation: z.literal('reconcile'), cell: z.uuid() }),
]);
/** Does: Defines controlled tenant access intent. Used by: operator access form and auth action. */
export const accessBodySchema = z.strictObject({
  target: z.uuid(),
  user: z.uuid().optional(),
  reason: z.string().trim().min(1).max(512),
});
/** Does: Defines member selection intent. Used by: tenant picker. */
export const selectionBodySchema = z.strictObject({ membership: z.uuid() });
/** Does: Validates customer-visible memberships without infrastructure identifiers. Used by: tenant picker. */
export const membershipsResponseSchema = successResponseSchema(
  z.array(
    z.strictObject({
      id: z.uuid(),
      tenantId: z.uuid(),
      tenantCode: z.string(),
      company: z.string(),
      userType: z.string().nullable(),
    })
  )
);
/** Does: Validates bounded operator registry views. Used by: control overview API and UI. */
export const controlResponseSchema = successResponseSchema(
  z.strictObject({
    cells: z.array(
      z.strictObject({
        id: z.uuid(),
        code: z.string(),
        name: z.string(),
        enabled: z.boolean(),
      })
    ),
    tenants: z.array(
      z.strictObject({
        id: z.uuid(),
        tenant_code: z.string(),
        company: z.string(),
        tier: z.string(),
        status: z.string(),
        cell_id: z.uuid().nullable(),
        provisioned: z.boolean(),
      })
    ),
    users: z
      .array(
        z.strictObject({ id: z.uuid(), email: z.email(), status: z.string() })
      )
      .default([]),
    members: z.array(
      z.strictObject({
        id: z.uuid(),
        portal_user_id: z.uuid(),
        tenant_id: z.uuid(),
        status: z.string(),
        user_type: z.string().nullable(),
        ready: z.boolean(),
        entity_id: z.uuid().nullable().default(null),
      })
    ),
    jobs: z.array(
      z.strictObject({
        id: z.uuid(),
        tenant_id: z.uuid(),
        stage: z.string(),
        failure_code: z.string().nullable(),
        membership_id: z.uuid().nullable().default(null),
        record_id: z.uuid().nullable().default(null),
        kind: z.string().nullable().default(null),
      })
    ),
    grants: z.array(
      z.strictObject({
        id: z.uuid(),
        portal_user_id: z.uuid(),
        role: z.string(),
        permission: z.string(),
      })
    ),
  })
);
/** Does: Validates immutable audit views. Used by: audit review. */
export const auditResponseSchema = successResponseSchema(
  z.array(
    z.strictObject({
      id: z.uuid(),
      operator_id: z.uuid(),
      effective_user_id: z.uuid().nullable(),
      target_id: z.uuid().nullable(),
      event: z.string(),
      reason: z.string(),
      created_at: z.string(),
    })
  )
);
/** Does: Validates a tenant-scoped linked identity record. Used by: the Core identity read. */
export const identityResponseSchema = successResponseSchema(
  z.strictObject({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    code: z.string(),
  })
);

/** Does: Returns the durable job created by a control command. Used by: operator provisioning follow-up. */
export const controlCommandResponseSchema = successResponseSchema(
  z.strictObject({ jobId: z.uuid().nullable() })
);

/**
 * Does: Describes the current tenant's bounded navigation eligibility.
 * Used by: the Core identity navigation endpoint and product shell.
 */
export const navigationResponseSchema = successResponseSchema(
  z.strictObject({
    employees: z.boolean(),
  })
);
