/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  argumentsFor,
  environment,
  localConfiguration,
  endpoint,
} from '../../src/application/shared/configuration.js';
import {
  adminModules,
  validateAdminRegistry,
} from '../../src/modules/admin.js';
import { createAdminDatabase } from '../../src/infrastructure/runtime/adminDatabase.js';
import { withState } from '../../src/infrastructure/provisioning/state.js';
import {
  renderClient,
  renderSettings,
} from '../../src/infrastructure/provisioning/render.js';
const env = {
  ADMIN_DATABASE_TEST: '127.0.0.1:5555/nap_test',
  SETUP_DATABASE_TEST: '127.0.0.1:5555/postgres',
  NAP_ADMIN_PSWD_TEST: 'admin-secret',
  NAP_APP_PSWD_TEST: 'app-secret',
};
describe('admin registry and configuration', () => {
  it('constructs all twelve inherited models without opening a connection', async () => {
    const db = createAdminDatabase('postgresql://invalid/unused');
    try {
      expect(
        Object.keys(db.db).filter(k => adminModules[0].models[k])
      ).toHaveLength(12);
      validateAdminRegistry();
    } finally {
      await db.close();
    }
  });
  it.each(
    [
      [],
      ['--env'],
      ['--env', 'dev', '--env', 'test'],
      ['--env', 'other'],
      ['--password', 'secret'],
      ['dev'],
    ].map(args => [args])
  )('rejects malformed CLI arguments %j', args =>
    expect(() => argumentsFor(args)).toThrow('INVALID_ARGUMENTS')
  );
  it.each(['dev', 'test', 'prod'])('accepts explicit environment %s', name =>
    expect(argumentsFor(['--env', name])).toBe(name)
  );
  it.each([
    m => ({ ...m, databaseTarget: 'cell' }),
    m => ({ ...m, schema: 'public' }),
    m => ({ ...m, migrations: null }),
    m => ({ ...m, entitlementType: 'other' }),
    m => ({ ...m, migrations: [...m.migrations, ...m.migrations] }),
    m => ({
      ...m,
      models: {
        bad: class {
          static schema = { dbSchema: 'cell', table: 'bad' };
        },
      },
    }),
  ])('rejects invalid descriptors before connecting', change =>
    expect(() => validateAdminRegistry([change(adminModules[0])])).toThrow(
      'INVALID_REGISTRY'
    )
  );
  it('rejects duplicate module names', () =>
    expect(() =>
      validateAdminRegistry([...adminModules, ...adminModules])
    ).toThrow());
  it('checks endpoints and keeps secret values out of validation errors', () => {
    expect(localConfiguration('test', env).database).toBe('nap_test');
    expect(() =>
      localConfiguration('test', {
        ...env,
        SETUP_DATABASE_TEST: 'elsewhere/postgres',
      })
    ).toThrow('ENDPOINT_MISMATCH');
    for (const value of [
      'user:secret@host/db',
      'host/db?password=secret',
      'host/db#secret',
      'postgresql://host/db',
    ])
      expect(() => endpoint(value, 'ADMIN_DATABASE_TEST')).toThrow(
        'INVALID_CONFIGURATION'
      );
  });
  it('loads the override file without replacing inherited settings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nap-config-'));
    try {
      const file = join(dir, 'private.env');
      await writeFile(file, 'VALUE=file\nFILE_ONLY=loaded\n');
      expect(environment({ NAP_ENV_FILE: file, VALUE: 'shell' })).toMatchObject(
        { VALUE: 'shell', FILE_ONLY: 'loaded' }
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('writes private state and rejects concurrent operations', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nap-state-'));
    try {
      const file = join(dir, 'state.json');
      await withState(file, async (_, save) => {
        await save({ secret: 'private' });
        await expect(withState(file, () => {})).rejects.toThrow('STATE_LOCKED');
      });
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      await withState(file, async saved =>
        expect(saved.secret).toBe('private')
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('redacts provider failures', async () => {
    const call = renderClient({ RENDER_API_KEY: 'secret' }, async () => {
      throw new Error('provider secret');
    });
    await expect(call('/postgres')).rejects.toThrow('RENDER_REQUEST_FAILED');
    expect(() => renderSettings({})).toThrow('INVALID_CONFIGURATION');
  });
});
