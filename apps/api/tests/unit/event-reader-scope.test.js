/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eventReaderScope } from '../../src/modules/admin-tenancy/domain/authorization.js';
import { isTenantPermitted } from '../../src/modules/admin-tenancy/domain/scope.js';

const napsoft = { id: randomUUID() };
const acme = { id: randomUUID(), tenant_code: 'ACME' };
const db = {
  tenants: {
    findWhere: async ({ tenant_code }) =>
      tenant_code.$in.includes('ACME') ? [{ id: acme.id }] : [],
  },
};
const read = patterns =>
  eventReaderScope(db, { patterns, napsoftCode: 'NAP' }, napsoft);

describe('eventReaderScope (M0001-12-R004)', () => {
  it('reads every event, including null-tenant ones, for a NAP reader', async () => {
    const scope = await read(['NAP::*::*::*']);
    expect(scope.tenantIds).toBe('*');
    expect(scope.excludeTenantIds).toBeUndefined();
  });

  it('reads every tenant but Napsoft for a `*` reader', async () => {
    const scope = await read(['*::*::*::read']);
    expect(scope).toMatchObject({
      tenantIds: '*',
      excludeTenantIds: [napsoft.id],
    });
    expect(isTenantPermitted(scope, acme.id)).toBe(true);
    expect(isTenantPermitted(scope, napsoft.id)).toBe(false);
  });

  it('reads only its own tenant for a tenant_admin', async () => {
    expect((await read(['ACME::*::*::*'])).tenantIds).toEqual([acme.id]);
  });

  it('reads nothing without a covering pattern', async () => {
    expect(
      (await read(['ACME::admin-tenancy::events::write'])).tenantIds
    ).toEqual([]);
    expect((await read([])).tenantIds).toEqual([]);
  });
});
