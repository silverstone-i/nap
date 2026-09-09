/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import { cachedLookup } from './authorizationCache.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
import type { CellTransaction } from '../db/withTenantTransaction.js';
import type { AdminRepositories } from '../db/admin/repositories.js';
import type { CellRepositories } from '../db/cell/repositories.js';

const assignmentSchema = z
  .object({
    id: z.uuid(),
    tenant_code: z.string(),
    company: z.string(),
    status: z.string(),
    cell_id: z.uuid().nullable(),
    provisioned: z.boolean(),
    rbac_ready: z.boolean(),
    revision: z.number().int(),
    code: z.string().nullable(),
    enabled: z.boolean().nullable(),
  })
  .nullable();
const membershipSchema = z
  .object({
    id: z.uuid(),
    tenant_id: z.uuid(),
    user_type: z.string().nullable(),
    entity_id: z.uuid().nullable(),
  })
  .nullable();
const entitlementsSchema = z.array(
  z.object({
    module: z.string(),
    enabled: z.boolean(),
    revision: z.number().int(),
  })
);

/** Does: Loads tenant routing using current central revisions. Called by: session and destination authorization. */
export function cachedAssignment(
  tx: AdminTransaction<AdminRepositories>,
  tenantId: string
) {
  return cachedLookup(
    tx,
    'routing',
    tenantId,
    assignmentSchema,
    () =>
      tx.cache_revisions.current([
        { domain: 'tenant', entity: tenantId },
        { domain: 'routing', entity: 'global' },
      ]),
    () => tx.cells.assignment(tenantId)
  );
}
/** Does: Loads the selected active membership. Called by: session resolution after checking tenant eligibility. */
export function cachedMembership(
  tx: AdminTransaction<AdminRepositories>,
  actorId: string,
  tenantId: string
) {
  return cachedLookup(
    tx,
    'membership',
    `${actorId}.${tenantId}`,
    membershipSchema,
    () =>
      tx.cache_revisions.current([
        { domain: 'principal', entity: actorId },
        { domain: 'tenant', entity: tenantId },
      ]),
    async () =>
      (await tx.portal_user_tenants.activeFor(actorId)).find(
        m => m.tenant_id === tenantId
      ) ?? null
  );
}
/** Does: Loads central module eligibility. Called by: session resolution for the assigned cell. */
export function cachedEntitlements(
  tx: AdminTransaction<AdminRepositories>,
  tenantId: string
) {
  return cachedLookup(
    tx,
    'entitlements',
    tenantId,
    entitlementsSchema,
    () => tx.cache_revisions.current([{ domain: 'tenant', entity: tenantId }]),
    () => tx.module_entitlements.findWhere({ tenant_id: tenantId })
  );
}
/** Does: Loads locally projected module eligibility. Called by: session enrichment before route gates. */
export function cachedProjections(
  tx: CellTransaction<CellRepositories>,
  tenantId: string
) {
  return cachedLookup(
    tx,
    'projections',
    tenantId,
    entitlementsSchema,
    () => tx.cache_revisions.current(tenantId),
    () => tx.entitlement_projections.findWhere({})
  );
}
