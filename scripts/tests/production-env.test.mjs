/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { productionEnvironment } from '../provision/production-env.mjs';

let directory;
let env;
let blueprint;
const defaults = {
  RENDER_WORKSPACE_ID: 'tea-fixture',
  RENDER_REGION: 'virginia',
  RENDER_POSTGRES_VERSION: '18',
  RENDER_POSTGRES_PLAN: '0.1c-256mb',
  RENDER_DISK_GB: '1',
};

/** Does: Writes a Blueprint fixture with literal settings. Called by: configuration tests. */
async function writeBlueprint(
  entries = Object.entries(defaults).map(([key, value]) => ({ key, value }))
) {
  await writeFile(
    blueprint,
    JSON.stringify({ services: [{ type: 'web', envVars: entries }] })
  );
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nap-production-env-'));
  blueprint = join(directory, 'render.yaml');
  env = {
    NAP_ENV_FILE: join(directory, '.env'),
    RENDER_API_KEY: 'private-fixture-key',
    RENDER_API_SERVICE_ID: 'srv-fixture',
  };
  await writeBlueprint();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

it('reads defaults without modifying the private configuration', async () => {
  const content = 'RENDER_REGION=\nRENDER_DISK_GB=\n';
  await writeFile(env.NAP_ENV_FILE, content);
  expect(await productionEnvironment(env, blueprint)).toMatchObject({
    ...defaults,
    ...env,
  });
  expect(await readFile(env.NAP_ENV_FILE, 'utf8')).toBe(content);
});

it('uses nonblank shell, then file, then Blueprint settings', async () => {
  await writeFile(
    env.NAP_ENV_FILE,
    'RENDER_REGION=oregon\nRENDER_DISK_GB=5\nRENDER_POSTGRES_PLAN=\n'
  );
  const resolved = await productionEnvironment(
    { ...env, RENDER_REGION: ' frankfurt ', RENDER_DISK_GB: '  ' },
    blueprint
  );
  expect(resolved).toMatchObject({
    ...defaults,
    RENDER_REGION: 'frankfurt',
    RENDER_DISK_GB: '5',
  });
});

it('accepts complete private settings without reading a Blueprint', async () => {
  expect(
    await productionEnvironment(
      { ...env, ...defaults },
      join(directory, 'missing')
    )
  ).toMatchObject(defaults);
});

it('reports all missing private keys without exposing secrets', async () => {
  delete env.RENDER_API_KEY;
  delete env.RENDER_API_SERVICE_ID;
  await expect(productionEnvironment(env, blueprint)).rejects.toThrow(
    'Required RENDER_API_KEY, RENDER_API_SERVICE_ID'
  );
});

it('rejects invalid storage before provisioning', async () => {
  await expect(
    productionEnvironment({ ...env, RENDER_DISK_GB: '3' }, blueprint)
  ).rejects.toThrow('Invalid Render storage');
});

it.each([
  'missing',
  'malformed',
  'duplicate mapping',
  'multiple services',
  'duplicate setting',
  'dynamic value',
])('rejects %s Blueprint defaults safely', async kind => {
  if (kind === 'missing') await rm(blueprint);
  if (kind === 'malformed')
    await writeFile(blueprint, 'services: [secret-fixture');
  if (kind === 'duplicate mapping')
    await writeFile(blueprint, 'services: []\nservices: []');
  if (kind === 'multiple services')
    await writeFile(
      blueprint,
      JSON.stringify({ services: [{ type: 'web' }, { type: 'web' }] })
    );
  if (kind === 'duplicate setting')
    await writeBlueprint([
      { key: 'RENDER_REGION', value: 'one' },
      { key: 'RENDER_REGION', value: 'two' },
    ]);
  if (kind === 'dynamic value')
    await writeBlueprint([
      { key: 'RENDER_REGION', fromService: { name: 'secret-fixture' } },
    ]);
  await expect(productionEnvironment(env, blueprint)).rejects.toThrow(
    /render.yaml/
  );
  await expect(productionEnvironment(env, blueprint)).rejects.not.toThrow(
    'secret-fixture'
  );
});

it('never reads credentials from the Blueprint and reports missing defaults together', async () => {
  delete env.RENDER_API_KEY;
  await writeBlueprint([{ key: 'RENDER_API_KEY', value: 'secret-fixture' }]);
  await expect(productionEnvironment(env, blueprint)).rejects.toThrow(
    'Required RENDER_API_KEY, RENDER_WORKSPACE_ID, RENDER_REGION, RENDER_POSTGRES_VERSION, RENDER_POSTGRES_PLAN, RENDER_DISK_GB'
  );
});

it('resolves the repository Blueprint independently of cwd', async () => {
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
  expect(await productionEnvironment(env)).toMatchObject({
    RENDER_REGION: 'virginia',
  });
  cwd.mockRestore();
});

it.each([false, true])(
  'leaves real state untouched on CLI preflight failure (existing: %s)',
  async existing => {
    const stateFile = join(directory, 'state.json');
    const savedState = JSON.stringify({
      environment: 'prod',
      databases: { admin: { operationId: 'preserved' } },
    });
    if (existing) await writeFile(stateFile, savedState);
    await writeFile(env.NAP_ENV_FILE, 'RENDER_API_KEY=private-fixture\n');
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../database.mjs', import.meta.url)),
        'setup',
        'admin',
        '--env',
        'prod',
      ],
      {
        cwd: directory,
        env: { NAP_ENV_FILE: env.NAP_ENV_FILE, NAP_PROVISION_STATE: stateFile },
        encoding: 'utf8',
        timeout: 10000,
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Required RENDER_API_SERVICE_ID');
    expect(result.stderr).toContain('Setup stopped before provisioning');
    expect(result.stderr).not.toContain('private-fixture');
    expect(existsSync(`${stateFile}.lock`)).toBe(false);
    expect(existsSync(stateFile)).toBe(existing);
    if (existing) expect(await readFile(stateFile, 'utf8')).toBe(savedState);
  }
);

it('accepts a custom admin database name from the private file', async () => {
  await writeFile(env.NAP_ENV_FILE, 'ADMIN_DATABASE_NAME_PROD=acme_admin\n');
  expect(
    (await productionEnvironment(env, blueprint)).ADMIN_DATABASE_NAME_PROD
  ).toBe('acme_admin');
});

it.each(['invalid-name', '1admin', 'Admin', 'a'.repeat(64)])(
  'rejects invalid admin name %s before provisioning',
  async name => {
    await writeFile(env.NAP_ENV_FILE, `ADMIN_DATABASE_NAME_PROD=${name}\n`);
    await expect(productionEnvironment(env, blueprint)).rejects.toThrow(
      'ADMIN_DATABASE_NAME_PROD'
    );
  }
);
