/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { PLATFORM_ADMIN_CAPABILITIES } from '../../../capability/systemRoles.js';
import { AdminAccessError } from './errors.js';

function matches(capabilities, requested) {
  return capabilities.includes(requested);
}

/**
 * Resolve the caller's platform capabilities.
 *
 * Interim rule until I0005: the bootstrap login (the portal user holding the
 * active Napsoft membership with a null `member_type`) receives
 * `PLATFORM_ADMIN_CAPABILITIES` in an unrestricted session; every other
 * caller receives none.
 * @param {object} db Admin database handle.
 * @param {{user: string, restricted?: boolean}} session
 * @returns {Promise<{actorId: string, platform: 'platform_admin'|null, platformCapabilities: string[]}>}
 * @throws {AdminAccessError} `FORBIDDEN` when the caller is not an active portal user.
 */
export async function resolveAuthorization(db, session) {
  const user = await db.portal_users.findOneBy(
    { id: session.user, status: 'active' },
    { columnWhitelist: ['id'] }
  );
  if (!user) throw new AdminAccessError('FORBIDDEN');
  if (session.restricted !== true) {
    const bootstrap = await db.portal_users.findBootstrapLogin();
    if (bootstrap?.id === user.id)
      return {
        actorId: user.id,
        platform: 'platform_admin',
        platformCapabilities: [...PLATFORM_ADMIN_CAPABILITIES],
      };
  }
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
      archiveManagement: true,
    };
  return {
    platformPortalUserRead: false,
    tenantIds: [],
    archiveManagement: false,
  };
}
