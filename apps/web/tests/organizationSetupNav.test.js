/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  ORGANIZATION_SETUP_CHILDREN,
  visibleOrganizationSetupChildren,
} from '../src/shell/organizationSetupNav.js';
import { NO_CAPABILITIES, capabilitiesFixture } from './testUtils.jsx';

const ACME = { id: 'acme', code: 'ACME' };

describe('visibleOrganizationSetupChildren (M0005-R026)', () => {
  it('lists the four directory screens', () => {
    expect(ORGANIZATION_SETUP_CHILDREN.map(child => child.path)).toEqual([
      '/directory/people',
      '/directory/organizations',
      '/directory/tenant-contacts',
      '/directory/labels',
    ]);
  });

  it('shows nothing without the directory read capability', () => {
    expect(visibleOrganizationSetupChildren(NO_CAPABILITIES)).toEqual([]);
    expect(
      visibleOrganizationSetupChildren(
        capabilitiesFixture({
          patterns: ['ACME::access-control::*::*'],
          targetTenant: ACME,
        })
      )
    ).toEqual([]);
  });

  it('shows every screen with the directory read capability in the selected tenant', () => {
    expect(
      visibleOrganizationSetupChildren(
        capabilitiesFixture({
          patterns: ['ACME::business-directory::directory::read'],
          targetTenant: ACME,
        })
      ).map(child => child.id)
    ).toEqual(['people', 'organizations', 'tenant-contacts', 'labels']);
  });
});
