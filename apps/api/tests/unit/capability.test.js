/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  matchesCapability,
  validateCapability,
} from '../../src/capability/index.js';
import { isTenantPermitted } from '../../src/modules/admin-tenancy/domain/scope.js';

const requested = 'accounting::ledger::read';
const tenantId = '11111111-1111-4111-8111-111111111111';
const otherTenantId = '22222222-2222-4222-8222-222222222222';
const tenantScope = {
  platformPortalUserRead: false,
  tenantIds: [tenantId],
  deniedTenantIds: [],
  archiveManagement: false,
};

function isAuthorized(scope, targetTenantId, grants, capability) {
  return (
    isTenantPermitted(scope, targetTenantId) &&
    grants.some(grant => matchesCapability(grant, capability))
  );
}

describe('capability validation', () => {
  it.each([
    requested,
    'accounting::ledger::*',
    'accounting::*::*',
    '*::*::*',
    '*::ledger::read',
    'accounting::*::read',
  ])('accepts capability pattern %s', capability => {
    expect(validateCapability(capability)).toBe(capability);
  });

  it('requires requested capabilities to be fully explicit', () => {
    expect(validateCapability(requested, { allowWildcard: false })).toBe(
      requested
    );
    expect(() =>
      validateCapability('accounting::ledger::*', { allowWildcard: false })
    ).toThrow(TypeError);
  });

  it.each([
    undefined,
    null,
    1,
    '',
    'accounting::ledger::',
    '::ledger::read',
    'accounting::::read',
    '::::',
    'accounting::read',
    'accounting::ledger::entry::read',
    'Accounting::ledger::read',
    'accounting::ledger_entry::read',
    'accounting::led*ger::read',
  ])('rejects invalid capability %j', capability => {
    expect(() => validateCapability(capability)).toThrow(TypeError);
  });
});

describe('capability matching', () => {
  it.each([
    ['accounting::ledger::read', requested],
    ['accounting::ledger::*', requested],
    ['accounting::*::read', requested],
    ['*::ledger::read', requested],
    ['accounting::*::*', requested],
    ['*::*::*', requested],
  ])('%s matches %s', (grant, capability) => {
    expect(matchesCapability(grant, capability)).toBe(true);
  });

  it('matches future capabilities covered by a wildcard', () => {
    expect(
      matchesCapability('accounting::ledger::*', 'accounting::ledger::close')
    ).toBe(true);
    expect(
      matchesCapability('accounting::*::*', 'accounting::revaluation::run')
    ).toBe(true);
  });

  it.each([
    ['projects::ledger::read', requested],
    ['accounting::journal::read', requested],
    ['accounting::ledger::write', requested],
    ['accounting::ledger::', requested],
    ['::::', requested],
    [null, requested],
    ['*::*::*', 'accounting::ledger::*'],
    ['*::*::*', 'tenant::accounting::ledger::read'],
  ])('%j does not authorize %j', (grant, capability) => {
    expect(matchesCapability(grant, capability)).toBe(false);
  });

  it('cannot bypass tenant scope', () => {
    const grants = ['*::*::*'];
    expect(isAuthorized(tenantScope, tenantId, grants, requested)).toBe(true);
    expect(isAuthorized(tenantScope, otherTenantId, grants, requested)).toBe(
      false
    );
  });
});
