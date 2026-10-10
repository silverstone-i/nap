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
  'BULK_FAILED',
]);

/** Zod schema for any API error envelope. */
export const apiErrorResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  error: z.strictObject({
    code: z.enum(apiErrorCodes),
    message: z.string().min(1),
    // I0005-R007: present on a capability denial.
    capability: z.string().optional(),
    reason: z.string().optional(),
    // M0005-R030: on `BULK_FAILED`, each failed item and its code.
    details: z
      .array(z.strictObject({ id: z.uuid(), code: z.string() }))
      .optional(),
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
 * Zod schema for the browser startup context — I0001-R022. Deliberately
 * excludes a session credential, password data, role assignment, or raw
 * capability list; `strictObject` on every level rejects one if a later
 * change tries to add it.
 */
export const accessContextSchema = z.strictObject({
  session: sessionViewSchema,
  user: z.strictObject({ id: z.uuid(), email: z.string() }),
  selectedTenant: eligibleTenantSchema.nullable(),
  operator: eligibleTenantSchema.nullable(),
  // Whether the user has an eligible tenant to select. What the user may
  // do comes from `GET /session/capabilities` (I0005-R010).
  entryPoints: z.strictObject({ tenant: z.boolean() }),
});

/** Zod schema for the success envelope returned by `GET /access/context`. */
export const accessContextResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: accessContextSchema,
});

/**
 * Build a response schema for one of this module's cursor-paginated list
 * endpoints: `{rows: [...], nextCursor}`, never an exact total (I0002-R009).
 * @param {import('zod').ZodType} rowSchema
 * @returns {import('zod').ZodType}
 */
function cursorPageResponseSchema(rowSchema) {
  return z.strictObject({
    version: z.literal(transportVersion),
    data: z.strictObject({
      rows: z.array(rowSchema),
      nextCursor: z.string().nullable(),
    }),
  });
}

/**
 * Zod schema for the safe tenant view — `tenantView`
 * (`apps/api` `domain/tenants.js`), reused verbatim by `GET /tenants`
 * (I0002-R007).
 */
export const tenantViewSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  tier: z.string(),
  status: z.string(),
  cellId: z.uuid().nullable(),
  provisioned: z.boolean(),
  rbacReady: z.boolean(),
  // I0006-R001: the Napsoft client the tenant was provisioned from.
  clientId: z.uuid().nullable(),
});

/** Zod schema for a tenant's provisioning job, `tenantJobView` (I0006-R011). */
export const tenantJobViewSchema = z.strictObject({
  tenantId: z.uuid(),
  cellId: z.uuid(),
  stage: z.string(),
  status: z.string(),
  attempts: z.number(),
  failureCode: z.string().nullable(),
});

/** Zod schema for the success envelope returned by `GET /tenants`. */
export const tenantsListResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: z.strictObject({
    rows: z.array(
      tenantViewSchema.extend({ job: tenantJobViewSchema.nullable() })
    ),
    nextCursor: z.string().nullable(),
    // I0006-R011: whether any tenant job is queued or running on any page.
    anyActive: z.boolean(),
  }),
});

/**
 * Zod schema for the safe portal-user view — `userView`
 * (`apps/api` `domain/accounts.js`), reused by `POST /accounts/users` and
 * its lifecycle routes. Never a password hash or role assignment.
 */
export const userViewSchema = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  status: z.string(),
  mustChangePassword: z.boolean(),
  deactivatedAt: z.coerce.date().nullable(),
});

/** Zod schema for the success envelope returned by `POST /accounts/users` and its lifecycle routes. */
export const userResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: userViewSchema,
});

/**
 * Zod schema for one `GET /accounts/users` row — `userView`
 * (`apps/api` `domain/accounts.js`).
 */
export const userListRowSchema = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  status: z.string(),
  mustChangePassword: z.boolean(),
  deactivatedAt: z.coerce.date().nullable(),
});

/** Zod schema for the success envelope returned by `GET /accounts/users`. */
export const usersListResponseSchema =
  cursorPageResponseSchema(userListRowSchema);

/**
 * Zod schema for one `GET /sessions` row — `sessionListView`
 * (`apps/api` `domain/session.js`, I0009-R003). Never a token or token hash.
 */
export const sessionListRowSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  tenant: z
    .strictObject({ id: z.uuid(), code: z.string(), name: z.string() })
    .nullable(),
  startedAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  status: z.enum(['active', 'ended']),
  endedAt: z.coerce.date().nullable(),
});

/** Zod schema for the success envelope returned by `GET /sessions` (I0009-R001). */
export const sessionsListResponseSchema =
  cursorPageResponseSchema(sessionListRowSchema);

/** Zod schema for one `GET /accounts/users/:id/memberships` row (I0008-R013). */
export const userMembershipSchema = z.strictObject({
  id: z.uuid(),
  tenantId: z.uuid(),
  tenantCode: z.string(),
  tenantName: z.string(),
  memberType: z.string().nullable(),
  status: z.enum(['pending', 'active', 'suspended']),
});

/** Zod schema for the success envelope returned by `GET /accounts/users/:id/memberships`. */
export const userMembershipsResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: z.array(userMembershipSchema),
});

/**
 * Zod schema for the safe cell view — `cellView` (`apps/api`
 * `domain/cells.js`). Column names are passed through unmapped (unlike
 * `tenantView`/`userView`), matching `GET /control/overview`'s existing,
 * unchanged contract.
 */
export const cellViewSchema = z.strictObject({
  id: z.uuid(),
  environment: z.string(),
  database_name: z.string(),
  enabled: z.boolean(),
  created_at: z.coerce.date(),
  created_by: z.uuid().nullable(),
  updated_at: z.coerce.date(),
  updated_by: z.uuid().nullable(),
  deactivated_at: z.coerce.date().nullable(),
});

/** Zod schema for the safe provisioning-operation view — `operationView` (`apps/api` `domain/cells.js`). */
export const operationViewSchema = z.strictObject({
  id: z.uuid(),
  cell_id: z.uuid(),
  operation_id: z.uuid(),
  requested_action: z.string(),
  stage: z.string(),
  status: z.string(),
  attempts: z.number(),
  failure_code: z.string().nullable(),
  started_at: z.coerce.date().nullable(),
  completed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

/** A cell's reference-seed state (I0007-R010). */
export const seedStateSchema = z.enum([
  'current',
  'missing',
  'queued',
  'running',
  'failed',
  'unknown',
]);

/** Zod schema for the success envelope returned by `GET /control/overview`. */
export const controlOverviewResponseSchema = z.strictObject({
  version: z.literal(transportVersion),
  data: z.strictObject({
    rows: z.array(
      z.strictObject({
        cell: cellViewSchema,
        operation: operationViewSchema.nullable(),
        // I0006-R010: whether the runtime registry reports the cell ready.
        ready: z.boolean(),
        // I0007-R010.
        seedState: seedStateSchema,
      })
    ),
    nextCursor: z.string().nullable(),
    // I0003-R030: whether any job is queued or running on any page.
    anyActive: z.boolean(),
    // I0007-R009: reference-seed counts across every cell.
    referenceSeed: z.strictObject({
      declaredVersion: z.number().nullable(),
      current: z.number(),
      missing: z.number(),
      queued: z.number(),
      running: z.number(),
      failed: z.number(),
    }),
  }),
});

/** Zod schema for `reference-rollout` data (I0007-R007). */
export const referenceRolloutSchema = z.strictObject({
  declaredVersion: z.number().nullable(),
  queued: z.array(z.uuid()),
  skipped: z.array(z.strictObject({ cell: z.uuid(), reason: z.string() })),
});

const capabilityTenantSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
});

/** Zod schema for `GET /session/capabilities` data (I0005-R010). */
export const sessionCapabilitiesSchema = z.strictObject({
  patterns: z.array(z.string()),
  homeTenant: capabilityTenantSchema.nullable(),
  targetTenant: capabilityTenantSchema.nullable(),
  napsoftTenant: capabilityTenantSchema.nullable(),
});

/**
 * Whether a pattern matches a required capability (I0005-R005): each of the
 * four `::` parts is equal or `*`, and a tenant `*` never matches the
 * Napsoft tenant. Entitlements are the server's to check.
 * @param {string} pattern `TENANT::module::router::action`, parts may be `*`.
 * @param {string} required `TENANT::module::router::action`, no `*`.
 * @param {string|null} napsoftCode
 * @returns {boolean}
 */
export function patternMatches(pattern, required, napsoftCode) {
  const have = pattern.split('::');
  const need = required.split('::');
  if (have.length !== 4 || need.length !== 4) return false;
  if (have[0] === '*' ? need[0] === napsoftCode : have[0] !== need[0])
    return false;
  return [1, 2, 3].every(
    index => have[index] === '*' || have[index] === need[index]
  );
}

/** Zod schema for one access-control role view (M0003 §10). */
export const roleViewSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isImmutable: z.boolean(),
  archived: z.boolean(),
  revision: z.number(),
  grants: z.array(z.string()),
});

/** Zod schema for a user's active role assignments (M0003 §10). */
export const userRolesSchema = z.strictObject({
  userId: z.uuid(),
  roles: z.array(roleViewSchema),
});

/** Zod schema for one capability catalogue entry (M0003-R005). */
export const capabilityEntrySchema = z.strictObject({
  capability: z.string(),
  module: z.string(),
  router: z.string(),
  action: z.string(),
});

/** Zod schema for one country lookup row (M0004-R008). */
export const countrySchema = z.strictObject({
  code: z.string().regex(/^[A-Z]{2}$/),
  alpha3: z.string().regex(/^[A-Z]{3}$/),
  numericCode: z.string().regex(/^[0-9]{3}$/),
  name: z.string().min(1),
});

/** Zod schema for one currency lookup row (M0004-R008). */
export const currencySchema = z.strictObject({
  code: z.string().regex(/^[A-Z]{3}$/),
  numericCode: z.string().regex(/^[0-9]{3}$/),
  name: z.string().min(1),
  minorUnit: z.number().int().min(0).max(4),
});

// Business directory (M0005 §10). A tax ID only ever travels as its last
// four digits, except from the reveal route (M0005-R012).
const directoryRecordBase = {
  id: z.uuid(),
  taxIdLast4: z
    .string()
    .regex(/^[0-9]{4}$/)
    .nullable(),
  archived: z.boolean(),
  revision: z.number().int().positive(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  // List rows name their primary email's and phone's labels (M0005-R027).
  primaryEmailLabel: z.string().nullable().optional(),
  primaryPhoneLabel: z.string().nullable().optional(),
  duplicateTaxIds: z.array(z.uuid()).optional(),
};

/** Portal-access statuses a person shows (I0008-R008). */
export const PORTAL_ACCESS_STATUSES = Object.freeze([
  'off',
  'requested',
  'invited',
  'on',
  'failed',
]);

/** Zod schema for a person's portal-access status (I0008-R008). */
export const portalAccessSchema = z.strictObject({
  status: z.enum(PORTAL_ACCESS_STATUSES),
  failureCode: z.string().nullable(),
});

/** Zod schema for an employee or contact (M0005-R002). */
export const personViewSchema = z.strictObject({
  ...directoryRecordBase,
  kind: z.enum(['employee', 'contact']),
  firstName: z.string(),
  lastName: z.string(),
  isPortalUser: z.boolean(),
  portalAccess: portalAccessSchema,
});

/** Zod schema for a vendor or client (M0005-R003). */
export const organizationViewSchema = z.strictObject({
  ...directoryRecordBase,
  kind: z.enum(['vendor', 'client']),
  legalName: z.string(),
  dbaName: z.string().nullable(),
});

/** Zod schema for a vendor or client contact (M0005-R004). */
export const organizationContactViewSchema = z.strictObject({
  ...directoryRecordBase,
  kind: z.enum(['vendor_contact', 'client_contact']),
  organizationId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  isPortalUser: z.boolean(),
  portalAccess: portalAccessSchema,
  isPrimaryContact: z.boolean(),
  isBillingContact: z.boolean(),
  isPrimaryTaxContact: z.boolean(),
});

/** Zod schema for one email or phone (M0005-R014). */
export const contactMethodViewSchema = z.strictObject({
  id: z.uuid(),
  partyId: z.uuid(),
  type: z.enum(['email', 'phone']),
  value: z.string(),
  labelId: z.uuid().nullable(),
  isPrimary: z.boolean(),
  archived: z.boolean(),
  revision: z.number().int().positive(),
});

/** Zod schema for one address (M0005-R015). */
export const addressViewSchema = z.strictObject({
  id: z.uuid(),
  partyId: z.uuid(),
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().regex(/^[A-Z]{2}$/),
  labelId: z.uuid().nullable(),
  isPrimary: z.boolean(),
  archived: z.boolean(),
  revision: z.number().int().positive(),
});

// The detail read adds each label's name (M0005-R014, R015).
const labelName = z.string().nullable();
const recordDetail = {
  contactMethods: z.array(contactMethodViewSchema.extend({ labelName })),
  addresses: z.array(addressViewSchema.extend({ labelName })),
};

/**
 * A person's roles on the detail read (I0010 §10), present only for a
 * session holding `access-control::roles::read`. `held` marks roles waiting
 * for the person's first sign-in.
 */
const personRoles = {
  roles: z
    .array(
      z.strictObject({
        id: z.uuid(),
        code: z.string(),
        name: z.string(),
        held: z.boolean(),
      })
    )
    .optional(),
};

/** Zod schema for a person with their details. */
export const personDetailSchema = personViewSchema.extend({
  ...recordDetail,
  ...personRoles,
});

/** Zod schema for an organization with its details and contacts. */
export const organizationDetailSchema = organizationViewSchema.extend({
  ...recordDetail,
  contacts: z.array(
    organizationContactViewSchema.extend({
      primaryEmailLabel: labelName,
      primaryPhoneLabel: labelName,
    })
  ),
});

/** Zod schema for an organization contact with its details. */
export const organizationContactDetailSchema =
  organizationContactViewSchema.extend({ ...recordDetail, ...personRoles });

/** Zod schema for one label (M0005-R017). */
export const contactLabelViewSchema = z.strictObject({
  id: z.uuid(),
  appliesTo: z.enum(['email', 'phone', 'address']),
  name: z.string(),
  archived: z.boolean(),
  revision: z.number().int().positive(),
});
