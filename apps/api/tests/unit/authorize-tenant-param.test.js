/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { authorize } from '../../src/capability/authorize.js';
import { accessScope } from '../../src/modules/admin-tenancy/domain/authorization.js';

const NAPSOFT = {
  id: randomUUID(),
  tenant_code: 'NAP',
  is_napsoft: true,
  cell_id: randomUUID(),
};
const ACME = {
  id: randomUUID(),
  tenant_code: 'ACME',
  is_napsoft: false,
  cell_id: randomUUID(),
};
const OTHER = {
  id: randomUUID(),
  tenant_code: 'OTHER',
  is_napsoft: false,
  cell_id: randomUUID(),
};
const TENANTS = [NAPSOFT, ACME, OTHER];

/**
 * Deps for `authorize` where `userId` is an active member of `homeTenantId`
 * and resolves `patterns` there.
 */
function deps(userId, homeTenantId, patterns) {
  const db = {
    tenants: {
      findOneBy: async where =>
        TENANTS.find(t =>
          where.is_napsoft ? t.is_napsoft : t.id === where.id
        ) ?? null,
      findWhere: async where =>
        TENANTS.filter(t => where.id.$in.includes(t.id)),
    },
    portal_users: {
      findOneBy: async ({ id }) => (id === userId ? { id } : null),
    },
    portal_user_tenants: {
      findWhere: async ({ portal_user_id }) =>
        portal_user_id === userId
          ? [{ id: randomUUID(), tenant_id: homeTenantId }]
          : [],
    },
    module_entitlements: { findOneBy: async () => null },
  };
  return {
    admin: { db },
    cache: { getOrLoad: async () => [...patterns] },
  };
}

const READ = 'admin-tenancy::entitlements::read';
const OPTIONS = { target: 'napsoft', orTenantParam: 'tenant' };

describe('authorize with orTenantParam (M0001-10 §4)', () => {
  it('permits a tenant_admin reading its own tenant, scoped to that tenant', async () => {
    const user = randomUUID();
    const result = await authorize(
      deps(user, ACME.id, ['ACME::*::*::*']),
      { user },
      READ,
      { ...OPTIONS, params: { tenant: ACME.id } }
    );
    expect(result.decision).toBe('permit');
    expect(result.targetTenant.id).toBe(ACME.id);
    expect(accessScope(result).tenantIds).toEqual([ACME.id]);
  });

  it('denies a tenant_admin reading another tenant', async () => {
    const user = randomUUID();
    const result = await authorize(
      deps(user, ACME.id, ['ACME::*::*::*']),
      { user },
      READ,
      { ...OPTIONS, params: { tenant: OTHER.id } }
    );
    expect(result.decision).toBe('deny');
    expect(result.targetTenant.id).toBe(NAPSOFT.id);
  });

  it('never falls back to the Napsoft tenant named in the path', async () => {
    const user = randomUUID();
    const result = await authorize(
      deps(user, ACME.id, ['ACME::*::*::*']),
      { user },
      READ,
      { ...OPTIONS, params: { tenant: NAPSOFT.id } }
    );
    expect(result.decision).toBe('deny');
  });

  it('keeps the Napsoft decision and full scope for a Napsoft holder', async () => {
    const user = randomUUID();
    const result = await authorize(
      deps(user, NAPSOFT.id, ['NAP::admin-tenancy::entitlements::read']),
      { user },
      READ,
      { ...OPTIONS, params: { tenant: ACME.id } }
    );
    expect(result.decision).toBe('permit');
    expect(result.targetTenant.id).toBe(NAPSOFT.id);
    expect(accessScope(result).tenantIds).toBe('*');
  });

  it('ignores a path value that is not a UUID', async () => {
    const user = randomUUID();
    const result = await authorize(
      deps(user, ACME.id, ['ACME::*::*::*']),
      { user },
      READ,
      { ...OPTIONS, params: { tenant: 'not-a-uuid' } }
    );
    expect(result.decision).toBe('deny');
  });
});
