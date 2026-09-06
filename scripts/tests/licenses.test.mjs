/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import { checkLicenses, rejectedLicenses } from '../check-licenses.mjs';

it('accepts allowed licenses and fails closed on unknown, missing, guessed, and unapproved licenses', () => {
  expect(
    rejectedLicenses(
      {
        good: { licenses: 'MIT' },
        multiple: { licenses: ['MIT', 'ISC'] },
        missing: {},
        unknown: { licenses: 'UNKNOWN' },
        guessed: { licenses: 'MIT*' },
        disallowed: { licenses: 'GPL-3.0-only' },
        empty: { licenses: [] },
        mixed: { licenses: ['MIT', 'GPL-3.0-only'] },
      },
      ['MIT', 'ISC']
    )
  ).toEqual(['missing', 'unknown', 'guessed', 'disallowed', 'empty', 'mixed']);
});

it('checks hoisted transitive production dependencies while excluding development dependencies', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } =
    await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const directory = mkdtempSync(join(tmpdir(), 'nap-license-test-'));
  const json = (path, value) =>
    writeFileSync(join(directory, path), JSON.stringify(value));
  try {
    for (const name of ['direct', 'transitive', 'dev-only'])
      mkdirSync(join(directory, 'node_modules', name), { recursive: true });
    json('package.json', {
      name: 'fixture',
      version: '1.0.0',
      license: 'MIT',
      dependencies: { direct: '1.0.0' },
      devDependencies: { 'dev-only': '1.0.0' },
    });
    json('node_modules/direct/package.json', {
      name: 'direct',
      version: '1.0.0',
      license: 'MIT',
      dependencies: { transitive: '1.0.0' },
    });
    json('node_modules/transitive/package.json', {
      name: 'transitive',
      version: '1.0.0',
      license: 'ISC',
    });
    json('node_modules/dev-only/package.json', {
      name: 'dev-only',
      version: '1.0.0',
      license: 'GPL-3.0-only',
    });
    json('.licenses-allowed.json', { allowed: ['MIT', 'ISC'] });
    json('package-lock.json', {
      name: 'fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': { version: '1.0.0', dependencies: { direct: '1.0.0' } },
        'node_modules/direct': {
          version: '1.0.0',
          dependencies: { transitive: '1.0.0' },
        },
        'node_modules/transitive': { version: '1.0.0' },
        'node_modules/dev-only': { version: '1.0.0', dev: true },
      },
    });
    const root = pathToFileURL(directory + '/');
    expect(await checkLicenses(root)).toBe(3);
    json('node_modules/transitive/package.json', {
      name: 'transitive',
      version: '1.0.0',
      license: 'GPL-3.0-only',
    });
    await expect(checkLicenses(root)).rejects.toThrow('transitive@1.0.0');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
