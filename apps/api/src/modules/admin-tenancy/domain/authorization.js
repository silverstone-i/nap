/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { PLATFORM_ADMIN_CAPABILITIES } from '../../../capability/systemRoles.js';
import { AdminAccessError } from './errors.js';

function matches(capabilities, requested) {
  return capabilities.includes(requested);
}

export async function resolveAuthorization(db, session) {
  const user = await db.portal_users.findOneBy(
    { id: session.user, status: 'active' },
    { columnWhitelist: ['id', 'is_root'] }
  );
  if (!user) throw new AdminAccessError('FORBIDDEN');
  if (
    user.is_root &&
    session.restricted !== true &&
    session.accessMode === 'normal'
  )
    return {
      actorId: user.id,
      platform: 'root',
      platformCapabilities: [...PLATFORM_ADMIN_CAPABILITIES],
    };
  return {
    actorId: user.id,
    platform: null,
    platformCapabilities: [],
  };
}

export function permits(context, capability) {
  return matches(context.platformCapabilities, capability);
}

export function requireCapability(context, capability) {
  if (!permits(context, capability)) throw new AdminAccessError('FORBIDDEN');
}

export function accessScope(context, capability) {
  if (matches(context.platformCapabilities, capability))
    return {
      platformPortalUserRead: true,
      tenantIds: '*',
      deniedTenantIds: [],
      archiveManagement: true,
    };
  return {
    platformPortalUserRead: false,
    tenantIds: [],
    deniedTenantIds: [],
    archiveManagement: false,
  };
}
