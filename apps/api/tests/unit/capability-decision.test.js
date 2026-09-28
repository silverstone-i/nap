/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { describe, expect, it } from 'vitest';
import { decide, requiredCapability } from '../../src/capability/decision.js';
import {
  checkRouteCapabilities,
  requireCapability,
  sessionOnly,
} from '../../src/capability/requireCapability.js';
import { requireSession } from '../../src/middleware/sessionContext.js';

const base = {
  restricted: false,
  active: true,
  entitled: true,
  napsoftCode: 'NAP',
};

function decideFor(patterns, required) {
  return decide({ ...base, patterns, required });
}

describe('decide (I0005-R005, R006)', () => {
  it('builds the required capability from the target tenant (R003)', () => {
    expect(requiredCapability('ACME', 'payables::payments::read')).toBe(
      'ACME::payables::payments::read'
    );
  });

  it('permits a support read in a customer tenant but not in Napsoft', () => {
    expect(
      decideFor(['*::*::*::read'], 'ACME::payables::payments::read')
    ).toEqual({ decision: 'permit', reason: 'ROLE' });
    expect(
      decideFor(['*::*::*::read'], 'NAP::payables::payments::read')
    ).toEqual({ decision: 'deny', reason: 'NO_CAPABILITY' });
  });

  it('permits Napsoft only through an explicit NAP pattern', () => {
    expect(
      decideFor(['NAP::*::*::*'], 'NAP::admin-tenancy::control::write')
    ).toMatchObject({ decision: 'permit' });
  });

  it('keeps a tenant admin inside their own tenant', () => {
    expect(
      decideFor(['ACME::*::*::*'], 'OTHER::access-control::roles::read')
    ).toMatchObject({ reason: 'NO_CAPABILITY' });
  });

  it('denies an unentitled module whatever the pattern', () => {
    expect(
      decide({
        ...base,
        entitled: false,
        patterns: ['*::*::*::*'],
        required: 'ACME::sales::orders::read',
      })
    ).toEqual({ decision: 'deny', reason: 'NOT_ENTITLED' });
  });

  it('reports restricted and inactive before matching', () => {
    const input = {
      ...base,
      patterns: ['*::*::*::*'],
      required: 'ACME::access-control::roles::read',
    };
    expect(decide({ ...input, restricted: true }).reason).toBe('RESTRICTED');
    expect(decide({ ...input, active: false }).reason).toBe('INACTIVE');
  });
});

describe('checkRouteCapabilities (I0005-R002)', () => {
  const ok = (_request, response) => response.end();

  it('accepts declared, session-only, and public routes', () => {
    const router = Router();
    router.get(
      '/a',
      requireSession(),
      requireCapability('access-control::roles::read'),
      ok
    );
    router.post('/b', requireSession(), sessionOnly, ok);
    router.post('/c', ok);
    expect(() => checkRouteCapabilities(router, '/x')).not.toThrow();
  });

  it('refuses a protected route with no capability', () => {
    const router = Router();
    router.get('/a', requireSession(), ok);
    expect(() => checkRouteCapabilities(router, '/x')).toThrow(
      'Route declares no capability: GET /x/a'
    );
  });

  it('refuses a capability missing from the catalogue', () => {
    const router = Router();
    router.get(
      '/a',
      requireSession(),
      requireCapability('access-control::roles::delete'),
      ok
    );
    expect(() => checkRouteCapabilities(router, '/x')).toThrow(
      'not catalogued'
    );
  });

  it('refuses read on a route that is not GET', () => {
    const router = Router();
    router.post(
      '/a',
      requireSession(),
      requireCapability('access-control::roles::read'),
      ok
    );
    expect(() => checkRouteCapabilities(router, '/x')).toThrow(
      'Read capability on a non-GET route'
    );
  });
});
