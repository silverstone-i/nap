/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { withTenantTransaction } from '../../../infrastructure/runtime/tenantTransaction.js';

/**
 * A portal user's resolved pattern set in their home tenant (I0005-R004),
 * read from that tenant's cell: the distinct grants of the user's active
 * assignments on active roles. A user who is not an active member of the
 * tenant in `cell.tenant_members` resolves to no patterns, and so do
 * archived roles and archived assignments.
 *
 * I0005's decision model and M0003's no-escalation rule (R011) both use this
 * set.
 * @param {object} cell Home tenant's cell repository handle (`handle.db`).
 * @param {{tenantId: string, portalUserId: string}} caller
 * @returns {Promise<string[]>} Sorted patterns.
 */
export function resolvePatterns(cell, { tenantId, portalUserId }) {
  return withTenantTransaction(cell, tenantId, async tx => {
    const status = await cell.tenant_members.membershipStatus(
      tenantId,
      portalUserId,
      { tx }
    );
    if (status !== 'active') return [];
    return cell.role_grants.patternsForUser(portalUserId, { tx });
  });
}
