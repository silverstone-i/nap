/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import { cachedLookup } from './authorizationCache.js';
import { platformPermissions } from '@nap/shared';
import { HttpError } from '../util/httpError.js';
import type { AdminRepositories } from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
/** Does: Lists the initial operational support grants. Used by: explicit seeding. */
export const defaultSupportPermissions = platformPermissions.filter(
  p =>
    !['grants', 'role-policy', 'access', 'impersonate'].some(action =>
      p.endsWith(`::${action}`)
    )
);
/** Does: Seeds the shared support policy without overwriting edits. Called by: bootstrap and transition. */
export async function seedPlatformPolicy(
  tx: AdminTransaction<AdminRepositories>
) {
  const rows = await tx.support_policy.findWhere({ code: 'support' }, 'AND', {
    includeDeactivated: true,
  });
  if (!rows.length)
    await tx.support_policy.insert({
      code: 'support',
      permissions: JSON.stringify(defaultSupportPermissions),
    });
}
/** Does: Loads current central permissions from the new role model. Called by: session and control authorization. */
export async function platformGrants(
  tx: AdminTransaction<AdminRepositories>,
  actorId: string
): Promise<string[]> {
  const user = await tx.portal_users.lockIdentity(actorId);
  if (!user || user.status !== 'active' || user.must_change_password) return [];
  if (user.is_root) return [...platformPermissions];
  return cachedLookup(
    tx,
    'platform',
    actorId,
    z.array(z.enum(platformPermissions)),
    () =>
      tx.cache_revisions.current([
        { domain: 'principal', entity: actorId },
        { domain: 'support', entity: 'global' },
      ]),
    async () => {
      const roles = await tx.platform_roles.findWhere({
        portal_user_id: actorId,
      });
      if (roles.some(r => r.role === 'platform_admin'))
        return [...platformPermissions];
      if (!roles.some(r => r.role === 'support')) return [];
      const policy = await tx.support_policy.findOneBy({ code: 'support' });
      if (!policy || !Array.isArray(policy.permissions)) return [];
      return platformPermissions.filter(
        p =>
          !p.endsWith('::grants') &&
          !p.endsWith('::role-policy') &&
          policy.permissions instanceof Array &&
          policy.permissions.includes(p)
      );
    }
  );
}
/** Does: Checks one central operation against current grants. Called by: privileged operations inside the admin transaction. */
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
/** Does: Appends an operator event atomically with central changes. Called by: controlled operations. */
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
