/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  bootstrapSecrets,
  productionAdminConnection,
} from '../../src/application/shared/configuration.js';
import { bootstrapRoot } from '../../src/modules/admin-tenancy/domain/bootstrap.js';
import { ARGON2_MINIMUM } from '../../src/modules/admin-tenancy/domain/password.js';

const CONFIG = {
  tenantCode: 'NAP',
  tenantName: 'Napsoft',
  rootEmail: 'root@nap.test',
  rootPassword: 'correct-horse-battery-staple',
  hashingPolicy: ARGON2_MINIMUM,
};

/**
 * A fake admin database handle exposing only the repository methods and
 * `tx` bootstrap uses, so this test exercises its branching without a real
 * PostgreSQL server. `tenant`, `rootUser`, and `membership` seed the state
 * each lock method reports as already present.
 * @param {{tenant?: object|null, rootUser?: object|null, membership?: object|null}} state
 * @returns {object}
 */
function fakeDb({ tenant = null, rootUser = null, membership = null } = {}) {
  const events = [];
  return {
    events,
    async tx(fn) {
      return fn({ one: async () => ({}) });
    },
    tenants: {
      lockNapsoft: async () => tenant,
      lockActiveByCode: async () => null,
      insert: async dto => ({ id: 'new-tenant', ...dto }),
    },
    portal_users: {
      lockRoot: async () => rootUser,
      lockActiveByEmail: async () => null,
      insertRoot: async ({ email }) => ({
        id: 'new-root',
        email,
        is_root: true,
      }),
    },
    portal_user_tenants: {
      lockByUserAndTenant: async () => membership,
      insert: async dto => ({ id: 'new-membership', ...dto }),
    },
    managed_events: {
      append: async event => {
        events.push(event);
        return event;
      },
    },
  };
}

describe('bootstrapRoot conflicts unreachable through the schema alone', () => {
  it('reports MEMBERSHIP_CONFLICT when a stored membership carries a member_type', async () => {
    // The `protect_membership` trigger never allows this state for the root
    // and owning tenant in a real database; this test covers the branch
    // directly so it stays correct even though PostgreSQL can't produce it.
    const db = fakeDb({
      tenant: { id: 'tenant-1', tenant_code: 'NAP' },
      rootUser: { id: 'root-1', email: 'root@nap.test' },
      membership: { id: 'membership-1', member_type: 'employee' },
    });

    const result = await bootstrapRoot(db, CONFIG);

    expect(result).toEqual({ status: 'conflict', code: 'MEMBERSHIP_CONFLICT' });
    expect(db.events).toContainEqual(
      expect.objectContaining({
        event_key: 'bootstrap.failed',
        outcome: 'failed',
        details: { code: 'MEMBERSHIP_CONFLICT' },
      })
    );
  });
});

describe('bootstrapSecrets', () => {
  const env = {
    ROOT_TENANT_CODE_TEST: 'NAP',
    ROOT_COMPANY_TEST: 'Napsoft',
    ROOT_EMAIL_TEST: 'root@nap.test',
    ROOT_PASSWORD_TEST: 'a-configured-secret',
  };

  it('reads the four settings for the selected environment', () => {
    expect(bootstrapSecrets('test', env)).toEqual({
      tenantCode: 'NAP',
      tenantName: 'Napsoft',
      rootEmail: 'root@nap.test',
      rootPassword: 'a-configured-secret',
    });
  });

  it('rejects a missing or placeholder setting', () => {
    for (const change of [
      { ROOT_TENANT_CODE_TEST: undefined },
      { ROOT_COMPANY_TEST: '' },
      { ROOT_EMAIL_TEST: '<test-root-email>' },
      { ROOT_PASSWORD_TEST: undefined },
    ])
      expect(() => bootstrapSecrets('test', { ...env, ...change })).toThrow(
        'INVALID_CONFIGURATION'
      );
  });
});

describe('productionAdminConnection', () => {
  it('parses the published endpoint and role passwords', () => {
    const value = JSON.stringify({
      endpoint: 'admin-host:5432/nap_prod_admin?sslmode=require',
      adminPassword: 'prod-admin-secret',
      appPassword: 'prod-app-secret',
    });
    expect(productionAdminConnection({ ADMIN_DATABASE_PROD: value })).toEqual({
      endpoint: 'admin-host:5432/nap_prod_admin?sslmode=require',
      adminPassword: 'prod-admin-secret',
      appPassword: 'prod-app-secret',
    });
  });

  it('rejects missing, malformed, or incomplete configuration', () => {
    for (const value of [
      undefined,
      'not json',
      JSON.stringify({ endpoint: 'admin-host:5432/nap_prod_admin' }),
      JSON.stringify({
        endpoint: 'postgresql://user:pass@admin-host:5432/nap_prod_admin',
        adminPassword: 'x',
        appPassword: 'y',
      }),
    ])
      expect(() =>
        productionAdminConnection({ ADMIN_DATABASE_PROD: value })
      ).toThrow('INVALID_CONFIGURATION');
  });
});
