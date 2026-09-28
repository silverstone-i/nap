/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { can, denialMessage } from '../src/auth/capabilities.js';
import { NAPSOFT_TENANT, capabilitiesFixture } from './testUtils.jsx';

const ACME = { id: 'acme', code: 'ACME' };

describe('can (I0005-R011)', () => {
  it('returns false without capabilities', () => {
    expect(can(null, 'access-control::roles::read')).toBe(false);
    expect(can(undefined, 'access-control::roles::read')).toBe(false);
  });

  it('returns false when the session has no target tenant', () => {
    const capabilities = capabilitiesFixture({ targetTenant: null });
    expect(can(capabilities, 'access-control::roles::read')).toBe(false);
  });

  it('matches a tenant wildcard on a customer tenant but never on Napsoft', () => {
    const capabilities = capabilitiesFixture({
      patterns: ['*::*::*::*'],
      targetTenant: ACME,
    });
    expect(can(capabilities, 'access-control::roles::write')).toBe(true);
    expect(can(capabilities, 'admin-tenancy::control::read', 'napsoft')).toBe(
      false
    );
  });

  it('matches Napsoft only through an explicit Napsoft pattern', () => {
    const capabilities = capabilitiesFixture({
      patterns: ['NAP::admin-tenancy::control::read'],
    });
    expect(can(capabilities, 'admin-tenancy::control::read', 'napsoft')).toBe(
      true
    );
    expect(can(capabilities, 'admin-tenancy::control::write', 'napsoft')).toBe(
      false
    );
  });

  it("checks 'session' against the target tenant and 'napsoft' against Napsoft", () => {
    const capabilities = capabilitiesFixture({
      patterns: ['ACME::*::*::*'],
      targetTenant: ACME,
    });
    expect(can(capabilities, 'admin-tenancy::control::read')).toBe(true);
    expect(can(capabilities, 'admin-tenancy::control::read', 'session')).toBe(
      true
    );
    expect(can(capabilities, 'admin-tenancy::control::read', 'napsoft')).toBe(
      false
    );
  });

  it('uses the Napsoft code when Napsoft is the target tenant', () => {
    const capabilities = capabilitiesFixture({
      patterns: ['NAP::access-control::roles::read'],
      targetTenant: NAPSOFT_TENANT,
    });
    expect(can(capabilities, 'access-control::roles::read')).toBe(true);
  });

  it('honours an action wildcard', () => {
    const capabilities = capabilitiesFixture({
      patterns: ['*::*::*::read'],
      targetTenant: ACME,
    });
    expect(can(capabilities, 'access-control::roles::read')).toBe(true);
    expect(can(capabilities, 'access-control::roles::write')).toBe(false);
  });
});

describe('denialMessage', () => {
  it('names a known reason', () => {
    expect(denialMessage({ reason: 'NO_CAPABILITY' })).toBe(
      'You are not authorized to perform that action: your roles do not include it.'
    );
  });

  it('falls back to a generic message', () => {
    expect(denialMessage({ reason: null })).toBe(
      'You are not authorized to perform that action.'
    );
  });
});
