/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import snapshot from '../../src/modules/reference-data/seeds/snapshot.json' with { type: 'json' };
import {
  SEED_VERSION,
  seedReferenceData,
  validateSnapshot,
} from '../../src/modules/reference-data/seeds/referenceSeed.js';
import { descriptor } from '../../src/modules/reference-data/descriptor.js';
import { cellModules } from '../../src/modules/cell.js';

const valid = () => ({
  version: 1,
  countries: [
    { code: 'US', alpha3: 'USA', numericCode: '840', name: 'United States' },
  ],
  currencies: [
    { code: 'USD', numericCode: '840', name: 'US Dollar', minorUnit: 2 },
  ],
});

describe('reference-data snapshot (M0004-R004, R006)', () => {
  it('accepts the committed snapshot', () => {
    expect(() => validateSnapshot(snapshot)).not.toThrow();
    expect(snapshot.version).toBe(SEED_VERSION);
    expect(snapshot.countries.length).toBeGreaterThan(240);
    expect(snapshot.currencies.map(c => c.code)).toEqual(
      expect.arrayContaining(['USD', 'EUR', 'JPY'])
    );
  });

  it.each([
    ['a duplicate country code', d => d.countries.push({ ...d.countries[0] })],
    ['a lowercase code', d => (d.countries[0].code = 'us')],
    ['a two-digit numeric code', d => (d.currencies[0].numericCode = '84')],
    ['a minor unit above 4', d => (d.currencies[0].minorUnit = 5)],
    ['a missing name', d => (d.currencies[0].name = '')],
    ['version 0', d => (d.version = 0)],
  ])('rejects %s with SEED_FAILED', (_label, mutate) => {
    const data = valid();
    mutate(data);
    expect(() => validateSnapshot(data)).toThrow('SEED_FAILED');
  });

  it('writes nothing when the snapshot is invalid', async () => {
    const db = { tx: vi.fn() };
    const data = valid();
    data.currencies[0].minorUnit = 9;
    await expect(seedReferenceData(db, data)).rejects.toThrow('SEED_FAILED');
    expect(db.tx).not.toHaveBeenCalled();
  });
});

describe('reference-data descriptor (M0004-R005)', () => {
  it('is registered with a seed step that cell provisioning runs', () => {
    expect(cellModules).toContain(descriptor);
    expect(descriptor.schema).toBe('reference');
    expect(typeof descriptor.seed).toBe('function');
    expect(descriptor.capabilities).toEqual(['reference-data::lookups::read']);
  });
});
