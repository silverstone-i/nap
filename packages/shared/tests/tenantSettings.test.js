/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_IMAGES,
  effectiveGeneralSettings,
  effectiveSettingsSchema,
  formatPhone,
  GENERAL_SETTINGS,
  generalSettingsChangeSchema,
  generalSettingsViewSchema,
  normalizePhone,
  OVERRIDABLE_SETTINGS,
  profileChangeSchema,
  resolveGeneralSettings,
  settingDefaults,
  TIME_ZONES,
} from '@nap/shared';

describe('general settings schema (M0006-01-R002–R006)', () => {
  it('AC01: gives every setting its default when nothing is stored', () => {
    expect(settingDefaults()).toEqual({
      defaultCountry: 'US',
      currency: 'USD',
      timeZone: 'America/New_York',
      dateFormat: 'MM/DD/YYYY',
      language: 'en',
      recordsPerPage: 25,
    });
    const resolved = resolveGeneralSettings({});
    expect(Object.values(resolved).every(entry => !entry.stored)).toBe(true);
    expect(
      generalSettingsViewSchema.safeParse({ settings: resolved, revision: 1 })
        .success
    ).toBe(true);
  });

  it('AC02: lays stored values over defaults and drops unknown or stale ones', () => {
    const resolved = resolveGeneralSettings({
      timeZone: 'America/Chicago',
      recordsPerPage: 30,
      retired: true,
    });
    expect(resolved.timeZone).toEqual({
      value: 'America/Chicago',
      stored: true,
    });
    expect(resolved.recordsPerPage).toEqual({ value: 25, stored: false });
    expect(resolved).not.toHaveProperty('retired');
    const effective = effectiveGeneralSettings({ defaultCountry: 'GB' });
    expect(effective.defaultCountry).toBe('GB');
    const view = {
      ...effective,
      logoFileId: null,
      storageConnected: false,
      profileImage: null,
    };
    expect(effectiveSettingsSchema.safeParse(view).success).toBe(true);
  });

  it('AC03: accepts known settings with allowed values or null, and nothing else', () => {
    const ok = value => generalSettingsChangeSchema.safeParse(value).success;
    expect(ok({ timeZone: 'Europe/London', recordsPerPage: 100 })).toBe(true);
    expect(ok({ timeZone: null })).toBe(true);
    expect(ok({})).toBe(false);
    expect(ok({ unknown: 1 })).toBe(false);
    expect(ok({ recordsPerPage: 30 })).toBe(false);
    expect(ok({ timeZone: 'Mars/Olympus' })).toBe(false);
    expect(ok({ defaultCountry: 'gb' })).toBe(false);
    expect(ok({ language: 'fr' })).toBe(false);
  });

  it('AC04: marks only the R004 settings overridable', () => {
    expect(
      Object.entries(GENERAL_SETTINGS)
        .filter(([, setting]) => setting.overridable)
        .map(([name]) => name)
    ).toEqual(['timeZone', 'dateFormat', 'language', 'recordsPerPage']);
    expect(TIME_ZONES).toContain('UTC');
  });
});

describe('phones with the tenant default country (M0005-R046)', () => {
  it('AC29: reads and shows numbers in the tenant country', () => {
    expect(normalizePhone('020 7946 0958', 'GB')).toBe('+442079460958');
    expect(normalizePhone('020 7946 0958')).toBeNull();
    expect(formatPhone('+442079460958', 'GB')).toBe('020 7946 0958');
    expect(formatPhone('+12125551234', 'GB')).toBe('+1 212 555 1234');
    expect(formatPhone('+12125551234')).toBe('(212) 555-1234');
  });
});

describe('member overrides (M0006-03-R002, R003)', () => {
  it('lays valid overrides of overridable settings over tenant values', () => {
    const effective = effectiveGeneralSettings(
      { timeZone: 'America/Chicago', defaultCountry: 'GB' },
      {
        timeZone: 'Europe/London',
        recordsPerPage: 100,
        defaultCountry: 'FR',
        dateFormat: 'not-a-format',
      }
    );
    expect(effective.timeZone).toBe('Europe/London');
    expect(effective.recordsPerPage).toBe(100);
    expect(effective.defaultCountry).toBe('GB');
    expect(effective.dateFormat).toBe('MM/DD/YYYY');
    expect(OVERRIDABLE_SETTINGS).toEqual([
      'timeZone',
      'dateFormat',
      'language',
      'recordsPerPage',
    ]);
  });

  it('accepts only overridable settings, allowed values, and known images', () => {
    const ok = value => profileChangeSchema.safeParse(value).success;
    expect(ok({ overrides: { timeZone: 'UTC' }, revision: 0 })).toBe(true);
    expect(ok({ overrides: { timeZone: null }, revision: 2 })).toBe(true);
    expect(ok({ defaultImage: 'orbit', revision: 1 })).toBe(true);
    expect(ok({ defaultImage: null, revision: 1 })).toBe(true);
    expect(ok({ overrides: { defaultCountry: 'GB' }, revision: 0 })).toBe(
      false
    );
    expect(ok({ overrides: { currency: 'EUR' }, revision: 0 })).toBe(false);
    expect(ok({ overrides: { recordsPerPage: 30 }, revision: 0 })).toBe(false);
    expect(ok({ overrides: {}, revision: 0 })).toBe(false);
    expect(ok({ defaultImage: 'unknown', revision: 0 })).toBe(false);
    expect(ok({ revision: 0 })).toBe(false);
    expect(DEFAULT_PROFILE_IMAGES).toHaveLength(6);
  });
});
