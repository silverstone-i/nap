/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import { platformPermissions, platformRoleChangeSchema } from '@nap/shared';
import { audit, requirePlatform } from './platform.js';
import { HttpError } from '../util/httpError.js';
import type { AdminRepositories } from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
/** Does: Reads safe central role and entitlement details. Called by: operator overview. */
export async function platformAccessOverview(
  tx: AdminTransaction<AdminRepositories>,
  operator: string
) {
  await requirePlatform(tx, operator, 'overview');
  const policy = await tx.support_policy.findOneBy({ code: 'support' });
  return {
    roles: await tx.platform_roles.findWhere({}),
    support: z.array(z.string()).parse(policy?.permissions ?? []),
    entitlements: await tx.module_entitlements.findWhere({}),
  };
}
/** Does: Changes central role assignments or the shared support definition. Called by: platform-admin control route. */
export async function changePlatformRole(
  tx: AdminTransaction<AdminRepositories>,
  operator: string,
  body: z.infer<typeof platformRoleChangeSchema>
) {
  await requirePlatform(tx, operator, 'grants');
  await tx.tenants.lockBootstrap();
  let id: string;
  if (body.operation === 'support-policy') {
    if (
      body.permissions.some(
        p =>
          !platformPermissions.some(known => known === p) ||
          p.endsWith('::grants') ||
          p.endsWith('::role-policy')
      ) ||
      new Set(body.permissions).size !== body.permissions.length
    )
      throw new HttpError('INVALID_INPUT');
    const policy = await tx.support_policy.findOneBy({ code: 'support' });
    if (!policy) throw new HttpError('CONFLICT');
    id = policy.id;
    await tx.support_policy.update(id, {
      permissions: JSON.stringify(body.permissions),
    });
  } else {
    const user = await tx.portal_users.lockIdentity(body.user);
    if (!user || user.is_root) throw new HttpError('FORBIDDEN');
    const existing = (
      await tx.platform_roles.findWhere(
        { portal_user_id: body.user, role: body.role },
        'AND',
        { includeDeactivated: true }
      )
    )[0];
    if (existing) {
      id = existing.id;
      if (body.enabled) await tx.platform_roles.restoreWhere({ id });
      else await tx.platform_roles.removeWhere({ id });
    } else if (body.enabled)
      id = (
        await tx.platform_roles.insert({
          portal_user_id: body.user,
          role: body.role,
        })
      ).id;
    else throw new HttpError('NOT_FOUND');
  }
  await audit(tx, operator, body.operation, id, JSON.stringify(body));
  return { id };
}
