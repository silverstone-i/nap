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
