/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { rolesPresent, seedRoles } from './napsoftSeed.js';

/**
 * The immutable role seeded into a customer tenant (M0003-R009).
 * @param {string} tenantCode The tenant's `tenant_code`.
 * @returns {{code: string, name: string, grants: string[]}[]}
 */
export function customerRoles(tenantCode) {
  return [
    {
      code: 'tenant_admin',
      name: 'Tenant administrator',
      grants: [`${tenantCode}::*::*::*`],
    },
  ];
}

/**
 * Run the customer-tenant seed inside the caller's cell transaction: create
 * `tenant_admin` and assign it to the tenant's first administrator
 * (M0003-R009, I0006-R007).
 * @param {object} db Cell repository handle.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {{tenantId: string, tenantCode: string, portalUserId: string}} tenant
 * @returns {Promise<{created: string[], assignmentId: string}>}
 * @throws {import('./napsoftSeed.js').NapsoftSeedError} `SEED_DRIFT`
 */
export async function seedCustomerTenant(
  db,
  tx,
  { tenantId, tenantCode, portalUserId }
) {
  return seedRoles(db, tx, {
    tenantId,
    portalUserId,
    roles: customerRoles(tenantCode),
    assign: 'tenant_admin',
  });
}

/**
 * Read the customer-tenant seed back and confirm it is complete and
 * unchanged. Writes nothing.
 * @param {object} db Cell repository handle.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {{tenantId: string, tenantCode: string, portalUserId: string}} tenant
 * @returns {Promise<boolean>}
 */
export async function customerSeedPresent(
  db,
  tx,
  { tenantId, tenantCode, portalUserId }
) {
  return rolesPresent(db, tx, {
    tenantId,
    portalUserId,
    roles: customerRoles(tenantCode),
    assign: 'tenant_admin',
  });
}
