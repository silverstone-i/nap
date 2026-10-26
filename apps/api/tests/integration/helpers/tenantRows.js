/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';

/**
 * Insert a pending customer tenant row directly, for tests that need a
 * tenant but not provisioning. Production creates tenants only through
 * `tenant-provision` from a Napsoft client (I0006-R001).
 * @param {object} db Admin repository handle.
 * @param {object} [overrides] Column overrides, such as `client_id`.
 * @returns {Promise<object>} The `admin.tenants` row.
 */
export function insertTenant(db, overrides = {}) {
  return db.tx(tx =>
    db.tenants.insert(
      {
        tenant_code:
          'T' + randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase(),
        name: 'Acme Construction',
        tier: 'starter',
        status: 'pending',
        cell_id: null,
        provisioned: false,
        rbac_ready: false,
        is_napsoft: false,
        ...overrides,
      },
      { tx, actorId: randomUUID() }
    )
  );
}

/**
 * The ID of a login's unarchived membership in a tenant, for selecting it
 * (I0012-R009). Tests that give a login one party per tenant use this; it
 * takes the oldest when there are several.
 * @param {object} db Admin repository handle.
 * @param {string} portalUserId
 * @param {string} tenantId
 * @returns {Promise<string>}
 */
export async function membershipIn(db, portalUserId, tenantId) {
  const row = await db.one(
    `SELECT id FROM admin.portal_user_tenants
      WHERE portal_user_id=$1 AND tenant_id=$2 AND deactivated_at IS NULL
      ORDER BY created_at, id LIMIT 1`,
    [portalUserId, tenantId]
  );
  return row.id;
}
