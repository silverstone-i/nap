/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Transport contracts shared by the API and the web client. The API
 * sends these envelopes; the client validates responses against the schemas.
 */
import { z } from 'zod';

/** Version number carried by every API response envelope. */
export const transportVersion = 1;

/** Zod schema for the success envelope returned by the health routes. */
export const healthResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: z.strictObject({ status: z.literal('ok') }),
});

/** Zod schema for the error envelope returned for unknown routes. */
export const notFoundResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  error: z.strictObject({
    code: z.literal('NOT_FOUND'),
    message: z.literal('Not found'),
  }),
});

/** Frozen health-route success envelope; validates against `healthResponseSchema`. */
export const healthResponse = Object.freeze({
  version: transportVersion,
  data: Object.freeze({ status: 'ok' }),
});

/** Frozen unknown-route error envelope; validates against `notFoundResponseSchema`. */
export const notFoundResponse = Object.freeze({
  version: transportVersion,
  error: Object.freeze({ code: 'NOT_FOUND', message: 'Not found' }),
});

/** Stable API error codes and their public messages. The API sends one of these and nothing else. */
export const apiErrorCodes = Object.freeze([
  'INVALID_INPUT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'PASSWORD_CHANGE_REQUIRED',
  'NOT_FOUND',
  'CONFLICT',
  'UNSUPPORTED_MEDIA_TYPE',
  'THROTTLED',
  'INTERNAL_ERROR',
  'AUDIT_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
]);

/** Zod schema for any API error envelope. */
export const apiErrorResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  error: z.strictObject({
    code: z.enum(apiErrorCodes),
    message: z.string().min(1),
  }),
});

/**
 * Zod schema for the safe session view.
 *
 * The view is deliberately incapable of carrying a credential: there is no
 * token or token-hash field to populate, and `strictObject` rejects one if a
 * later change tries to add it. `restricted` tells the client the account
 * must replace its password before any route other than password change and
 * logout will answer.
 */
export const sessionViewSchema = z.strictObject({
  id: z.uuid(),
  user: z.uuid(),
  tenant: z.uuid().nullable(),
  accessMode: z.enum(['normal', 'support']),
  effectiveUser: z.uuid().nullable(),
  accessReason: z.string().nullable(),
  accessExpiresAt: z.coerce.date().nullable(),
  restricted: z.boolean(),
  lastSeenAt: z.coerce.date(),
  idleExpiresAt: z.coerce.date(),
  absoluteExpiresAt: z.coerce.date(),
});

/** Zod schema for the success envelope returned by the session routes. */
export const sessionResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: sessionViewSchema,
});

/**
 * Zod schema for a tenant a caller may select — the narrow safe view
 * `eligibleTenantView` (`apps/api` `domain/tenantAccess.js`) produces.
 */
export const eligibleTenantSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  tier: z.string(),
});

/** Zod schema for the success envelope returned by `GET /access/tenants`. */
export const eligibleTenantsResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: z.array(eligibleTenantSchema),
});

/**
 * Zod schema for the browser startup context — F0001-R022. Deliberately
 * excludes a session credential, password data, role assignment, or raw
 * capability list; `strictObject` on every level rejects one if a later
 * change tries to add it.
 */
export const accessContextSchema = z.strictObject({
  session: sessionViewSchema,
  user: z.strictObject({ id: z.uuid(), email: z.string() }),
  selectedTenant: eligibleTenantSchema.nullable(),
  operator: eligibleTenantSchema.nullable(),
  entryPoints: z.strictObject({
    platform: z.boolean(),
    tenant: z.boolean(),
    tenantManagement: z.strictObject({
      tenants: z.boolean(),
      cells: z.boolean(),
      portalUsers: z.boolean(),
    }),
  }),
});

/** Zod schema for the success envelope returned by `GET /access/context`. */
export const accessContextResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: accessContextSchema,
});
