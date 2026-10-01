/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  SETTINGS_CHILDREN,
  visibleSettingsChildren,
} from '../src/shell/settingsNav.js';
import { NO_CAPABILITIES, capabilitiesFixture } from './testUtils.jsx';

const ACME = { id: 'acme', code: 'ACME' };

describe('visibleSettingsChildren', () => {
  it('lists Roles and Labels', () => {
    expect(SETTINGS_CHILDREN.map(child => child.path)).toEqual([
      '/settings/roles',
      '/settings/labels',
    ]);
  });

  it('shows nothing without capabilities', () => {
    expect(visibleSettingsChildren(NO_CAPABILITIES)).toEqual([]);
  });

  it('shows Roles for the roles read capability in the selected tenant', () => {
    expect(
      visibleSettingsChildren(
        capabilitiesFixture({
          patterns: ['ACME::access-control::roles::read'],
          targetTenant: ACME,
        })
      ).map(child => child.id)
    ).toEqual(['roles']);
  });

  it('shows Labels for the directory read capability', () => {
    expect(
      visibleSettingsChildren(
        capabilitiesFixture({
          patterns: ['ACME::business-directory::directory::read'],
          targetTenant: ACME,
        })
      ).map(child => child.id)
    ).toEqual(['labels']);
  });

  it('checks the target tenant, not Napsoft', () => {
    expect(
      visibleSettingsChildren(
        capabilitiesFixture({ patterns: ['NAP::*::*::*'], targetTenant: ACME })
      )
    ).toEqual([]);
  });
});
