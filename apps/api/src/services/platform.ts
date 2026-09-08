/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { platformPermissions } from '@nap/shared';
import { HttpError } from '../util/httpError.js';
import type { AdminRepositories } from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';

/** Does: Loads current central permissions. Called by: session and control authorization. */
export async function platformGrants(
  tx: AdminTransaction<AdminRepositories>,
  actorId: string
) {
  const user = await tx.portal_users.lockIdentity(actorId);
  if (!user || user.status !== 'active' || user.must_change_password) return [];
  if (user.is_root) return [...platformPermissions];
  const grants = await tx.platform_grants.findWhere({
    portal_user_id: actorId,
  });
  return grants
    .filter(
      g =>
        g.role === 'package_admin' ||
        [
          'admin-tenancy::control::access',
          'admin-tenancy::control::impersonate',
          'admin-tenancy::control::audit',
        ].includes(g.permission)
    )
    .map(g => g.permission);
}
/** Does: Requires a current central grant. Called by: each privileged operation inside its admin transaction. */
export async function requirePlatform(
  tx: AdminTransaction<AdminRepositories>,
  actorId: string,
  action: string
) {
  if (
    !(await platformGrants(tx, actorId)).includes(
      `admin-tenancy::control::${action}`
    )
  )
    throw new HttpError('FORBIDDEN');
}
/** Does: Appends an operator event atomically with central state changes. Called by: controlled operations. */
export async function audit(
  tx: AdminTransaction<AdminRepositories>,
  operator: string,
  event: string,
  target: string | null,
  reason: string,
  effective: string | null = null,
  session: string | null = null
) {
  await tx.managed_events.insert({
    operator_id: operator,
    effective_user_id: effective,
    target_id: target,
    event,
    reason,
    session_id: session,
  });
}
