/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { withTenantTransaction } from '../../../infrastructure/runtime/tenantTransaction.js';

/**
 * A membership's resolved pattern set in its tenant (I0005-R004,
 * I0012-R014), read from that tenant's cell: the distinct grants of the
 * membership's active assignments on active roles. A membership that is not
 * active in `cell.tenant_members` resolves to no patterns, and so do
 * archived roles and archived assignments.
 *
 * I0005's decision model and M0003's no-escalation rule (R011) both use this
 * set.
 * @param {object} cell Home tenant's cell repository handle (`handle.db`).
 * @param {{tenantId: string, membershipId: string}} caller
 * @returns {Promise<string[]>} Sorted patterns.
 */
export function resolvePatterns(cell, { tenantId, membershipId }) {
  return withTenantTransaction(cell, tenantId, async tx => {
    const member = await cell.tenant_members.byId(tenantId, membershipId, {
      tx,
    });
    if (member?.status !== 'active') return [];
    return cell.role_grants.patternsForMembership(membershipId, { tx });
  });
}
