/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Enqueue the current snapshot of every synced row of the given tenants,
 * skipping any (`topic`, `entity_id`, `revision`) already in `admin.outbox`
 * (I0004-R019). Without `tenantIds`, covers every tenant with a cell.
 * @param {object} db Admin repository handle.
 * @param {{tx: object, tenantIds?: string[]}} options
 * @returns {Promise<number>} Rows inserted.
 */
export async function enqueueTenantSnapshots(db, { tx, tenantIds }) {
  const ids = tenantIds ?? (await db.tenants.assignedIds({ tx }));
  if (ids.length === 0) return 0;
  const rows = [
    ...(await db.tenants.currentSnapshots(ids, { tx })),
    ...(await db.portal_user_tenants.currentSnapshots(ids, { tx })),
    ...(await db.module_entitlements.currentSnapshots(ids, { tx })),
  ];
  return db.outbox.enqueueMissing(rows, { tx });
}
