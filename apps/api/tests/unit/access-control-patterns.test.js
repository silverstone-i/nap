/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  covers,
  coveredBy,
  parseCapability,
  parsePattern,
  patternInCatalogue,
} from '../../src/modules/access-control/domain/patterns.js';
import {
  buildCatalogue,
  isCatalogued,
  parseDeclarations,
} from '../../src/modules/access-control/domain/capabilities.js';
import { capabilityCatalogue } from '../../src/modules/access-control/domain/catalogue.js';
import { validateCellRegistry } from '../../src/modules/cell.js';
import { validateAdminRegistry } from '../../src/modules/admin.js';
import { descriptor as accessControl } from '../../src/modules/access-control/descriptor.js';
import { descriptor as adminTenancy } from '../../src/modules/admin-tenancy/descriptor.js';

const napsoft = { napsoftCode: 'NAP' };

describe('parsePattern (M0003-R003)', () => {
  it.each([
    '*::*::*::*',
    'NAP::*::*::*',
    'ACME-1::access-control::roles::read',
    '*::*::*::read',
    'T_2::admin-tenancy::*::write',
  ])('accepts %s', pattern => {
    expect(parsePattern(pattern)).not.toBeNull();
  });

  it.each([
    'nap::*::*::*',
    '*::*::*',
    '*::*::*::*::*',
    '*::Admin::*::*',
    '*::a_b::*::*',
    '::*::*::*',
    'NAP::**::*::*',
    'NAP:: ::*::*',
    42,
    null,
  ])('rejects %s', pattern => {
    expect(parsePattern(pattern)).toBeNull();
  });
});

describe('parseCapability (M0003-R005)', () => {
  it('accepts an exact three-part capability and rejects wildcards', () => {
    expect(parseCapability('access-control::roles::read')).toEqual({
      module: 'access-control',
      router: 'roles',
      action: 'read',
    });
    expect(parseCapability('access-control::*::read')).toBeNull();
    expect(parseCapability('access-control::roles::Read')).toBeNull();
    expect(parseCapability('NAP::access-control::roles::read')).toBeNull();
  });
});

describe('covers (M0003-R011)', () => {
  it.each([
    ['*::*::*::*', 'ACME::sales::orders::write', true],
    ['*::*::*::*', '*::sales::*::read', true],
    ['*::*::*::read', '*::sales::orders::read', true],
    ['*::*::*::read', '*::sales::orders::write', false],
    ['ACME::*::*::*', 'ACME::sales::orders::read', true],
    ['ACME::*::*::*', 'OTHER::sales::orders::read', false],
    ['ACME::*::*::*', '*::sales::orders::read', false],
    ['ACME::sales::*::*', 'ACME::*::*::*', false],
    ['NAP::*::*::*', 'NAP::admin-tenancy::control::write', true],
  ])('%s covers %s: %s', (a, b, expected) => {
    expect(covers(a, b, napsoft)).toBe(expected);
  });

  it('never lets a tenant * cover the Napsoft tenant code', () => {
    expect(covers('*::*::*::*', 'NAP::*::*::*', napsoft)).toBe(false);
    expect(covers('*::*::*::read', 'NAP::x::y::read', napsoft)).toBe(false);
    expect(covers('*::*::*::*', 'NAP::*::*::*', { napsoftCode: null })).toBe(
      true
    );
  });

  it('lets a tenant * cover another *, since neither reaches Napsoft', () => {
    expect(covers('*::*::*::*', '*::*::*::read', napsoft)).toBe(true);
  });

  it('covers nothing when either side is malformed', () => {
    expect(covers('bad', '*::*::*::*', napsoft)).toBe(false);
    expect(covers('*::*::*::*', 'bad', napsoft)).toBe(false);
  });

  it('coveredBy needs one covering pattern', () => {
    const own = ['*::*::*::*', 'NAP::*::*::*'];
    expect(coveredBy(own, 'NAP::*::*::*', napsoft)).toBe(true);
    expect(coveredBy(['*::*::*::*'], 'NAP::*::*::*', napsoft)).toBe(false);
    expect(coveredBy([], '*::*::*::read', napsoft)).toBe(false);
  });
});

describe('catalogue (M0003-R004, R005)', () => {
  const catalogue = buildCatalogue([
    {
      name: 'sales',
      capabilities: ['sales::orders::read', 'sales::orders::write'],
    },
    { name: 'billing', capabilities: ['billing::invoices::read'] },
  ]);

  it('is the sorted union of every descriptor', () => {
    expect(catalogue.map(entry => entry.capability)).toEqual([
      'billing::invoices::read',
      'sales::orders::read',
      'sales::orders::write',
    ]);
    expect(isCatalogued(catalogue, 'sales::orders::write')).toBe(true);
    expect(isCatalogued(catalogue, 'sales::orders::delete')).toBe(false);
  });

  it('requires the exact parts of a pattern to match one catalogued capability', () => {
    expect(patternInCatalogue('*::*::*::*', catalogue)).toBe(true);
    expect(patternInCatalogue('ACME::sales::*::read', catalogue)).toBe(true);
    expect(patternInCatalogue('*::*::invoices::read', catalogue)).toBe(true);
    expect(patternInCatalogue('*::unknown::*::*', catalogue)).toBe(false);
    expect(patternInCatalogue('*::billing::orders::*', catalogue)).toBe(false);
    expect(patternInCatalogue('*::billing::*::write', catalogue)).toBe(false);
  });

  it.each([
    [{ name: 'sales' }],
    [{ name: 'sales', capabilities: ['other::orders::read'] }],
    [{ name: 'sales', capabilities: ['sales::orders'] }],
    [{ name: 'sales', capabilities: ['sales::orders::READ'] }],
    [{ name: 'sales', capabilities: ['sales::*::read'] }],
    [{ name: 'sales', capabilities: ['sales::o::read', 'sales::o::read'] }],
  ])('rejects malformed declarations %#', descriptor => {
    expect(() => parseDeclarations(descriptor)).toThrow('INVALID_CAPABILITIES');
  });

  it('makes the registries reject a descriptor with malformed capabilities', () => {
    expect(() =>
      validateCellRegistry([{ ...accessControl, capabilities: ['x::y::z'] }])
    ).toThrow();
    expect(() =>
      validateAdminRegistry([{ ...adminTenancy, capabilities: undefined }])
    ).toThrow();
  });

  it('lists the registered modules, including access-control and admin-tenancy', () => {
    const registered = capabilityCatalogue().map(entry => entry.capability);
    expect(registered).toEqual(
      expect.arrayContaining([
        'access-control::roles::read',
        'access-control::roles::write',
        'access-control::assignments::write',
        'admin-tenancy::control::read',
        'admin-tenancy::accounts::write',
      ])
    );
    expect(registered.some(c => c.startsWith('cell-tenancy::'))).toBe(false);
  });
});
