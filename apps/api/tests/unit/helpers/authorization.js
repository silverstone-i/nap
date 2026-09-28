/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';

/** The Napsoft tenant the fakes below serve. */
export const NAPSOFT = Object.freeze({
  id: randomUUID(),
  tenant_code: 'NAP',
  is_napsoft: true,
  cell_id: randomUUID(),
});

/**
 * Extend an in-memory admin handle so the real I0005 `authorize` resolves
 * `actorId` as an active Napsoft member, and return a cache stub that serves
 * `patterns` as the actor's resolved set without a cell. Other callers
 * resolve no home tenant and are denied `INACTIVE`.
 *
 * Existing `tenants` and `portal_user_tenants` methods keep answering every
 * query that is not about the Napsoft tenant or the actor's memberships.
 * @param {object} db Fake admin repository handle; mutated.
 * @param {string} actorId
 * @param {string[]} [patterns=['*::*::*::*', 'NAP::*::*::*']] Default: `platform_admin`.
 * @returns {{getOrLoad: Function}} Revision-cache stub for `api.cache`.
 */
export function authorizeActor(
  db,
  actorId,
  patterns = ['*::*::*::*', 'NAP::*::*::*']
) {
  const tenants = db.tenants ?? {};
  const memberships = db.portal_user_tenants ?? {};
  db.tenants = {
    ...tenants,
    findOneBy: async (where, options) => {
      if (where.is_napsoft || where.id === NAPSOFT.id) return { ...NAPSOFT };
      return tenants.findOneBy ? tenants.findOneBy(where, options) : null;
    },
    findWhere: async (where, ...rest) => {
      const ids = where.id?.$in;
      if (ids && Object.keys(where).length === 1 && ids.includes(NAPSOFT.id))
        return [{ ...NAPSOFT }];
      return tenants.findWhere ? tenants.findWhere(where, ...rest) : [];
    },
  };
  db.portal_user_tenants = {
    ...memberships,
    findWhere: async (where, ...rest) => {
      if (where.status === 'active' && where.portal_user_id !== undefined)
        return where.portal_user_id === actorId
          ? [{ id: randomUUID(), tenant_id: NAPSOFT.id }]
          : [];
      return memberships.findWhere ? memberships.findWhere(where, ...rest) : [];
    },
  };
  db.portal_users ??= {};
  db.portal_users.findOneBy ??= async ({ id }) => ({ id });
  return { getOrLoad: async () => [...patterns] };
}
