/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { AdminTenantError, withTenantErrors } from './errors.js';
import { parseLimit } from './validation.js';
import { tenantJobView } from './tenantProvisioning.js';

/** Tiers a tenant may be created with, matching `admin.tenants`' check constraint. */
export const TIERS = Object.freeze(['starter', 'growth', 'enterprise']);

const authoritySchema = z.strictObject({
  actorId: z.uuid(),
  granted: z.boolean(),
});

/**
 * Require the granted authority.
 * @param {unknown} authority Result of `buildControlAuthority` (domain/cells.js).
 * @returns {{actorId: string}}
 * @throws {AdminTenantError} `INVALID_INPUT`, `FORBIDDEN`
 */
function requireGranted(authority) {
  const result = authoritySchema.safeParse(authority);
  if (!result.success) throw new AdminTenantError('INVALID_INPUT');
  if (!result.data.granted) throw new AdminTenantError('FORBIDDEN');
  return result.data;
}

/** Safe projection of `admin.tenants`, in the API's literal camelCase contract (§10). */
export function tenantView(row) {
  return {
    id: row.id,
    code: row.tenant_code,
    name: row.name,
    tier: row.tier,
    status: row.status,
    cellId: row.cell_id,
    provisioned: row.provisioned,
    rbacReady: row.rbac_ready,
    clientId: row.client_id ?? null,
  };
}

/**
 * @typedef {object} AdminTenantsDb
 * @property {import('../models/tenants.js').Tenants} tenants
 * @property {import('../models/managed_events.js').ManagedEvents} managed_events
 * @property {import('../models/cache_revisions.js').CacheRevisions} cache_revisions
 * @property {(operation: (tx: object) => Promise<unknown>) => Promise<unknown>} tx
 */

/** A tenant code: trimmed, uppercased, a letter then 1–31 letters, digits, or `_` (M0001-07-R002). */
export const tenantCodeSchema = z
  .string()
  .transform(value => value.trim().toUpperCase())
  .refine(value => /^[A-Z][A-Z0-9_]{1,31}$/.test(value));

/** A tenant name: trimmed, 1–160 characters. */
export const tenantNameSchema = z
  .string()
  .transform(value => value.trim())
  .refine(value => value.length >= 1 && value.length <= 160);

/**
 * Raw columns `listTenants` reads before projecting through `tenantView`.
 * Deliberately narrower than `domain/access.js`'s `TENANT_VIEW_COLUMNS`
 * (which includes `is_napsoft`, `revision`, and audit columns) — I0002-R007
 * requires reusing `tenantView` verbatim, never that wider shape.
 */
/** Tenant job columns the list reports (I0006-R011). */
const TENANT_JOB_COLUMNS = Object.freeze([
  'tenant_id',
  'cell_id',
  'stage',
  'status',
  'attempts',
  'failure_code',
]);

const TENANT_LIST_COLUMNS = Object.freeze([
  'id',
  'tenant_code',
  'name',
  'tier',
  'status',
  'cell_id',
  'provisioned',
  'rbac_ready',
  'client_id',
]);

const tenantCursorSchema = z.strictObject({
  v: z.literal(1),
  op: z.literal('listTenants'),
  last: z.uuid(),
});

/**
 * Decode and validate an opaque tenant-list cursor.
 * @param {unknown} cursor
 * @returns {{id: string}|null}
 * @throws {AdminTenantError} `INVALID_INPUT`
 */
function parseTenantCursor(cursor) {
  if (cursor === undefined || cursor === null) return null;
  if (typeof cursor !== 'string' || cursor.length === 0)
    throw new AdminTenantError('INVALID_INPUT');
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new AdminTenantError('INVALID_INPUT');
  }
  const result = tenantCursorSchema.safeParse(decoded);
  if (!result.success) throw new AdminTenantError('INVALID_INPUT');
  return { id: result.data.last };
}

/**
 * Encode the next tenant-list page's cursor.
 * @param {{id: string}|null} nextCursor
 * @returns {string|null}
 */
function encodeTenantCursor(nextCursor) {
  if (!nextCursor) return null;
  const payload = { v: 1, op: 'listTenants', last: nextCursor.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Apply the shared 50/100 page limit, reporting the tenant error code.
 * @param {unknown} value
 * @returns {number}
 * @throws {AdminTenantError} `INVALID_INPUT`
 */
function parseLimitOrTenant(value) {
  try {
    return parseLimit(value);
  } catch {
    throw new AdminTenantError('INVALID_INPUT');
  }
}

/**
 * List every central tenant record in ascending `id` order, paginated by
 * opaque cursor (I0002-R007).
 * @param {AdminTenantsDb} db
 * @param {unknown} authority Result of `buildControlAuthority` (domain/cells.js) for `admin-tenancy::control::read`.
 * @param {{cursor?: unknown, limit?: unknown, clientId?: unknown}} [page] `clientId` returns that client's tenants, unpaged.
 * @returns {Promise<{rows: object[], nextCursor: string|null, anyActive: boolean}>} A page of safe tenant views, each with its provisioning job (I0006-R011).
 * @throws {AdminTenantError} `INVALID_INPUT`, `FORBIDDEN`, `INTERNAL_ERROR`
 */
export async function listTenants(
  db,
  authority,
  { cursor, limit, clientId } = {}
) {
  requireGranted(authority);
  const parsedLimit = parseLimitOrTenant(limit);
  const resumeFrom = parseTenantCursor(cursor);
  if (clientId !== undefined && !z.uuid().safeParse(clientId).success)
    throw new AdminTenantError('INVALID_INPUT');
  return withTenantErrors(async () => {
    // I0006-R001: a client's tenant, for the Provision action on the client.
    const page =
      clientId !== undefined
        ? {
            rows: await db.tenants.findWhere({ client_id: clientId }, 'AND', {
              columnWhitelist: TENANT_LIST_COLUMNS,
            }),
            nextCursor: null,
          }
        : await db.tenants.findAfterCursor(
            resumeFrom ?? {},
            parsedLimit,
            ['id'],
            {
              columnWhitelist: TENANT_LIST_COLUMNS,
            }
          );
    const ids = page.rows.map(row => row.id);
    const jobs = ids.length
      ? await db.tenant_provisioning.findWhere(
          { tenant_id: { $in: ids } },
          'AND',
          { columnWhitelist: TENANT_JOB_COLUMNS }
        )
      : [];
    const byTenantId = new Map(jobs.map(row => [row.tenant_id, row]));
    const anyActive = await db.tenant_provisioning.hasActive();
    return {
      rows: page.rows.map(row => ({
        ...tenantView(row),
        job: byTenantId.has(row.id)
          ? tenantJobView(byTenantId.get(row.id))
          : null,
      })),
      nextCursor: encodeTenantCursor(page.nextCursor),
      anyActive,
    };
  });
}
