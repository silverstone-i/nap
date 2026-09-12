/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { cachedProjections } from '../services/cachedSecurityState.js';
import { tenantCapabilities } from '../services/authorization.js';
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import type { CellHandle } from '../db/cell/repositories.js';
import type { ResolvedSession } from '../util/resolvedSession.js';
/**
 * Does: Loads business grants and entitlement projections from the selected database.
 * Called by: module dispatch after central session and cell readiness checks.
 */
export async function authorizeCell(
  cell: CellHandle,
  session: ResolvedSession
) {
  const tenantId = session.tenantId;
  if (!tenantId) throw new Error('Missing resolved tenant');
  return withTenantTransaction(cell, tenantId, async tx => {
    const permissions = await tenantCapabilities(tx, session);
    const projections = await cachedProjections(tx, tenantId);
    const entitlements = new Set(session.entitlements);
    for (const grant of session.entitlementState ?? []) {
      if (
        grant.enabled &&
        projections.some(
          p =>
            p.module === grant.module &&
            p.enabled &&
            p.revision === grant.revision
        )
      )
        entitlements.add(grant.module);
    }
    return { ...session, permissions, entitlements };
  });
}
