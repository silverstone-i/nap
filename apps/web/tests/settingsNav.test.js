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
  it('lists General, Storage, Roles, Labels, and Tax ID Formats', () => {
    expect(SETTINGS_CHILDREN.map(child => child.path)).toEqual([
      '/settings/general',
      '/settings/storage',
      '/settings/roles',
      '/settings/labels',
      '/settings/tax-id-formats',
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

  it('shows Labels and Tax ID Formats for the directory read capability', () => {
    expect(
      visibleSettingsChildren(
        capabilitiesFixture({
          patterns: ['ACME::business-directory::directory::read'],
          targetTenant: ACME,
        })
      ).map(child => child.id)
    ).toEqual(['labels', 'tax-id-formats']);
  });

  it('shows General for the general settings read capability (M0006-01-R010)', () => {
    expect(
      visibleSettingsChildren(
        capabilitiesFixture({
          patterns: ['ACME::tenant-settings::general::read'],
          targetTenant: ACME,
        })
      ).map(child => child.id)
    ).toEqual(['general']);
  });

  it('shows Storage for the storage read capability (M0006-02-R015)', () => {
    expect(
      visibleSettingsChildren(
        capabilitiesFixture({
          patterns: ['ACME::tenant-settings::storage::read'],
          targetTenant: ACME,
        })
      ).map(child => child.id)
    ).toEqual(['storage']);
  });

  it('checks the target tenant, not Napsoft', () => {
    expect(
      visibleSettingsChildren(
        capabilitiesFixture({ patterns: ['NAP::*::*::*'], targetTenant: ACME })
      )
    ).toEqual([]);
  });
});
