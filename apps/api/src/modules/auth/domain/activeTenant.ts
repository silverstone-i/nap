/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getDb } from '../../../db/index.js';

/** One tenant-picker entry (ADR-0004 decision 5). */
export interface ActiveBinding {
  tenant_code: string;
  company: string;
  last_used_at: Date;
}

/**
 * The caller's active bindings in active tenants, most recently used first.
 * Login returns this list for the tenant picker; only vendor contacts see
 * more than one entry (ADR-0004).
 */
export async function listActiveBindings(
  userId: string
): Promise<ActiveBinding[]> {
  const db = getDb();
  return db.any<ActiveBinding>(
    `SELECT t.tenant_code, t.company, b.last_used_at
       FROM admin.portal_user_tenants b
       JOIN admin.tenants t ON t.id = b.tenant_id
      WHERE b.portal_user_id = $1
        AND b.status = 'active' AND b.deactivated_at IS NULL
        AND t.status = 'active' AND t.deactivated_at IS NULL
      ORDER BY b.last_used_at DESC, t.tenant_code`,
    [userId]
  );
}

/**
 * ADR-0004 decision 4 (the Postgres rule, which is also decision 8's Redis
 * fallback): the active tenant is the most recently used active binding.
 * The RBAC PR layers the Redis key over this — keep the seam.
 */
export function resolveActiveTenant(bindings: ActiveBinding[]): string | null {
  return bindings[0]?.tenant_code ?? null;
}

/**
 * ADR-0004 decision 7: validate the requested code against the caller's
 * active bindings and mark that binding used, which makes it the active
 * tenant under the `MAX(last_used_at)` rule. False when the code names no
 * valid binding.
 */
export async function switchTenant(
  userId: string,
  tenantCode: string
): Promise<boolean> {
  const db = getDb();
  const binding = await db.oneOrNone<{ id: string }>(
    `SELECT b.id
       FROM admin.portal_user_tenants b
       JOIN admin.tenants t ON t.id = b.tenant_id
      WHERE b.portal_user_id = $1 AND t.tenant_code = $2
        AND b.status = 'active' AND b.deactivated_at IS NULL
        AND t.status = 'active' AND t.deactivated_at IS NULL`,
    [userId, tenantCode]
  );
  if (binding === null) {
    return false;
  }
  await db.portalUserTenants.updateWhere([{ id: binding.id }], {
    last_used_at: new Date(),
  });
  return true;
}
