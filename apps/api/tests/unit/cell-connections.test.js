/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtemp,
  writeFile,
  readFile,
  stat,
  chmod,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import {
  publishLocalConnection,
  publishRenderConnection,
  renderProvisioningState,
} from '../../src/infrastructure/provisioning/cellConnections.js';

const CELL = '6f1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const OTHER = '7a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
let dir;
afterEach(async () => dir && rm(dir, { recursive: true, force: true }));

async function envFile(text, mode = 0o600) {
  dir = await mkdtemp(join(tmpdir(), 'nap-publish-'));
  const file = join(dir, '.env');
  await writeFile(file, text, { mode });
  await chmod(file, mode);
  return file;
}

async function codeOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error.code;
  }
  return undefined;
}

function fakeRender(initial = {}) {
  const vars = { ...initial };
  const calls = [];
  const call = async (path, method = 'GET', body) => {
    calls.push({ path, method, body });
    if (method === 'PUT') {
      vars[decodeURIComponent(path.split('/').at(-1))] = body.value;
      return { key: path, value: body.value };
    }
    return Object.entries(vars).map(([key, value]) => ({
      envVar: { key, value },
      cursor: key,
    }));
  };
  return { call, vars, calls };
}

describe('local connection publishing (I0003-R011, R012, R040)', () => {
  it('merges the endpoint, keeps other lines, and keeps mode 0600', async () => {
    const file = await envFile(
      `A=1\nCELL_DATABASES_DEV='{"${OTHER}":"db/nap_other"}'\nB=2\n`
    );
    expect(await publishLocalConnection(file, CELL, 'db/nap_cell')).toEqual({
      changed: true,
    });
    const parsed = parseEnv(await readFile(file, 'utf8'));
    expect(JSON.parse(parsed.CELL_DATABASES_DEV)).toEqual({
      [OTHER]: 'db/nap_other',
      [CELL]: 'db/nap_cell',
    });
    expect(parsed.A).toBe('1');
    expect(parsed.B).toBe('2');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await publishLocalConnection(file, CELL, 'db/nap_cell')).toEqual({
      changed: false,
    });
  });

  it('adds the setting when absent', async () => {
    const file = await envFile('A=1');
    await publishLocalConnection(file, CELL, 'db/nap_cell');
    expect(parseEnv(await readFile(file, 'utf8')).CELL_DATABASES_DEV).toBe(
      JSON.stringify({ [CELL]: 'db/nap_cell' })
    );
  });

  it('refuses a conflicting entry (AC08) and an unsafe file', async () => {
    const file = await envFile(`CELL_DATABASES_DEV='{"${CELL}":"db/nap_x"}'\n`);
    expect(
      await codeOf(publishLocalConnection(file, CELL, 'db/nap_cell'))
    ).toBe('PUBLISH_CONFLICT');
    await chmod(file, 0o644);
    expect(await codeOf(publishLocalConnection(file, CELL, 'db/nap_x'))).toBe(
      'UNSAFE_STATE_FILE'
    );
  });

  it('reports a missing file as PUBLISH_FAILED without its path', async () => {
    const error = await publishLocalConnection(
      '/nonexistent/secret/.env',
      CELL,
      'db/nap_cell'
    ).catch(e => e);
    expect(error.code).toBe('PUBLISH_FAILED');
    expect(error.message).not.toContain('secret');
  });
});

describe('Render connection publishing (I0003-R011, R012, R013)', () => {
  const connection = {
    endpoint: 'host/nap_cell?sslmode=require',
    appPassword: 'app',
    adminPassword: 'admin',
  };

  it('merges into CELL_DATABASES_PROD and refuses a conflict', async () => {
    const render = fakeRender({ CELL_DATABASES_PROD: '{}', OTHER: 'x' });
    await publishRenderConnection(render.call, 'srv', CELL, connection);
    expect(JSON.parse(render.vars.CELL_DATABASES_PROD)).toEqual({
      [CELL]: connection,
    });
    expect(render.calls.at(-1)).toMatchObject({
      method: 'PUT',
      path: '/services/srv/env-vars/CELL_DATABASES_PROD',
    });
    expect(
      await codeOf(
        publishRenderConnection(render.call, 'srv', CELL, {
          ...connection,
          appPassword: 'different',
        })
      )
    ).toBe('PUBLISH_CONFLICT');
  });

  it('maps a refused Render request to PUBLISH_FAILED', async () => {
    const call = async () => {
      const error = new Error('RENDER_REQUEST_REFUSED');
      error.code = 'RENDER_REQUEST_REFUSED';
      throw error;
    };
    expect(
      await codeOf(publishRenderConnection(call, 'srv', CELL, connection))
    ).toBe('PUBLISH_FAILED');
  });

  it('keeps per-cell provisioning state in NAP_PROVISION_STATE_PROD', async () => {
    const render = fakeRender();
    const state = renderProvisioningState(render.call, 'srv');
    expect(await state.read(CELL)).toBeUndefined();
    await state.save(CELL, { renderId: 'dpg-1' });
    await state.save(OTHER, { renderId: 'dpg-2' });
    expect(await state.read(CELL)).toEqual({ renderId: 'dpg-1' });
    expect(JSON.parse(render.vars.NAP_PROVISION_STATE_PROD)).toHaveProperty(
      OTHER
    );
  });
});
