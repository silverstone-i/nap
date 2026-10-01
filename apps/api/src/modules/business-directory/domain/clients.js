/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Reads of the Napsoft tenant's clients for tenant provisioning
 * (I0006-R001). A new tenant starts from an active client record in the
 * Napsoft tenant's directory.
 */

import { withTenantTransaction } from '../../../infrastructure/runtime/tenantTransaction.js';

/**
 * An active client of `tenantId`, or null.
 * @param {object} cell Cell repository handle (`runtime.dbFor`).
 * @param {string} tenantId The tenant whose directory holds the client.
 * @param {string} clientId The client's party ID.
 * @returns {Promise<{id: string, legalName: string}|null>}
 */
export function findActiveClient(cell, tenantId, clientId) {
  return withTenantTransaction(cell, tenantId, async tx => {
    const party = await cell.parties.byKey(clientId, { tx });
    if (party?.kind !== 'client') return null;
    const row = await cell.organizations.byKey(clientId, { tx });
    if (!row || row.deactivated_at) return null;
    return { id: row.party_id, legalName: row.legal_name };
  });
}
