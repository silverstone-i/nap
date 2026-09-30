/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_CHILDREN,
  visibleDirectoryChildren,
} from '../src/shell/directoryNav.js';
import { NO_CAPABILITIES, capabilitiesFixture } from './testUtils.jsx';

const ACME = { id: 'acme', code: 'ACME' };

describe('visibleDirectoryChildren (M0005-R026)', () => {
  it('lists one directory screen per record kind', () => {
    expect(DIRECTORY_CHILDREN.map(child => child.path)).toEqual([
      '/directory/employees',
      '/directory/contacts',
      '/directory/vendors',
      '/directory/clients',
    ]);
  });

  it('shows nothing without the directory read capability', () => {
    expect(visibleDirectoryChildren(NO_CAPABILITIES)).toEqual([]);
    expect(
      visibleDirectoryChildren(
        capabilitiesFixture({
          patterns: ['ACME::access-control::*::*'],
          targetTenant: ACME,
        })
      )
    ).toEqual([]);
  });

  it('shows every screen with the directory read capability in the selected tenant', () => {
    expect(
      visibleDirectoryChildren(
        capabilitiesFixture({
          patterns: ['ACME::business-directory::directory::read'],
          targetTenant: ACME,
        })
      ).map(child => child.id)
    ).toEqual(['employees', 'contacts', 'vendors', 'clients']);
  });
});
