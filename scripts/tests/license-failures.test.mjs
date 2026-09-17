/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { init } from 'license-checker-rseidelsohn';
import { checkLicenses } from '../check-licenses.mjs';
vi.mock('license-checker-rseidelsohn', () => ({ init: vi.fn() }));

it('fails closed on incomplete installations and inventory while accepting optional absence and explicit workspace licenses', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nap-license-failures-'));
  /**
   * Does: Writes a fixture manifest or lockfile.
   * Called by: this test before each scanner scenario.
   */
  function json(path, value) {
    writeFileSync(join(directory, path), JSON.stringify(value));
  }
  const root = pathToFileURL(directory + '/');
  const lock = {
    packages: {
      '': { version: '1.0.0' },
      'apps/api': { version: '1.0.0' },
      'node_modules/required': { version: '1.0.0' },
      'node_modules/optional': { version: '1.0.0', optional: true },
      'node_modules/dev': { version: '1.0.0', dev: true },
    },
  };
  const inventory = {
    'fixture@1.0.0': { licenses: 'UNLICENSED' },
    'api@1.0.0': { licenses: 'UNLICENSED' },
    'required@1.0.0': { licenses: 'MIT' },
  };
  try {
    mkdirSync(join(directory, 'apps/api'), { recursive: true });
    mkdirSync(join(directory, 'node_modules/required'), { recursive: true });
    json('package.json', {
      name: 'fixture',
      version: '1.0.0',
      private: true,
      license: 'MIT',
    });
    json('apps/api/package.json', {
      name: 'api',
      version: '1.0.0',
      private: true,
      license: 'MIT',
    });
    json('.licenses-allowed.json', { allowed: ['MIT'] });
    json('package-lock.json', lock);
    init.mockImplementation((options, callback) => callback(null, inventory));
    await expect(checkLicenses(root)).rejects.toThrow(
      'Missing installed production'
    );
    json('node_modules/required/package.json', {
      name: 'required',
      version: '2.0.0',
    });
    await expect(checkLicenses(root)).rejects.toThrow('differs from lockfile');
    json('node_modules/required/package.json', {
      name: 'required',
      version: '1.0.0',
    });
    expect(await checkLicenses(root)).toBe(3);
    delete inventory['required@1.0.0'];
    await expect(checkLicenses(root)).rejects.toThrow('inventory omitted');
    inventory['required@1.0.0'] = { licenses: 'MIT OR ISC' };
    await expect(checkLicenses(root)).rejects.toThrow('Unapproved');
    init.mockImplementation((options, callback) =>
      callback(new Error('scanner failed'))
    );
    await expect(checkLicenses(root)).rejects.toThrow('scanner failed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
