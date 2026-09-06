/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { postgresFixture } from '../../apps/api/tests/fixtures/postgres.ts';

let fixture;
beforeAll(async () => {
  fixture = await postgresFixture();
}, 30000);
afterAll(async () => {
  await fixture?.cleanup();
}, 30000);

it('starts the compiled API, returns an empty 404, and releases its port on shutdown', async () => {
  // Ask the OS for an available port, then release it for the child. Unlike the
  // app factory test, this exercises the compiled entry point and signal handling.
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: {
      ...process.env,
      ...fixture.env,
      PORT: String(port),
      ADMIN_MIGRATION_URL_TEST: '',
      CELL_MIGRATION_URL_TEST: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  try {
    const deadline = Date.now() + 5000;
    let response;
    while (Date.now() < deadline) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/unknown`);
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    expect(response?.status).toBe(404);
    expect(await response.text()).toBe('');
    child.kill('SIGTERM');
    expect((await exited)[0]).toBe(0);
    await expect(fetch(`http://127.0.0.1:${port}`)).rejects.toThrow();
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
  }
});
it('fails startup for an invalid port without echoing its value', async () => {
  const child = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: { ...process.env, PORT: 'private-invalid-value' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', data => {
    output += data;
  });
  child.stderr.on('data', data => {
    output += data;
  });
  expect((await once(child, 'exit'))[0]).toBe(1);
  expect(output).toContain('Invalid API startup configuration');
  expect(output).not.toContain('private-invalid-value');
});

/** Run a compiled startup failure and capture only its public diagnostics. */
async function failedStartup(overrides) {
  const child = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: { ...process.env, ...fixture.env, ...overrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', data => {
    output += data;
  });
  child.stderr.on('data', data => {
    output += data;
  });
  const exited = once(child, 'exit');
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    expect((await exited)[0]).toBe(1);
    expect(output).not.toContain('API listening');
    expect(output).not.toContain(new URL(fixture.adminUrl).password);
    return output;
  } finally {
    clearTimeout(timer);
  }
}

it('refuses an owner connection before listening and releases the other pool', async () => {
  await failedStartup({ CELL_DATABASE_URL_TEST: fixture.cellUrl });
  const { count } = await fixture.control.one(
    'SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename = $1',
    [fixture.role]
  );
  expect(count).toBe(0);
});
it('closes the admin pool when cell connectivity fails without printing driver diagnostics', async () => {
  const unavailable = new URL(fixture.env.CELL_DATABASE_URL_TEST);
  unavailable.password = 'private-wrong-password';
  const output = await failedStartup({
    CELL_DATABASE_URL_TEST: unavailable.toString(),
  });
  expect(output).not.toContain('private-wrong-password');
  expect(
    await fixture.control.one(
      'SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename = $1',
      [fixture.role]
    )
  ).toEqual({ count: 0 });
});
it('releases both pools when the HTTP listener cannot bind', async () => {
  const listener = createServer();
  listener.listen(0);
  await once(listener, 'listening');
  try {
    expect(
      await failedStartup({ PORT: String(listener.address().port) })
    ).toContain('API failed to listen');
    expect(
      await fixture.control.one(
        'SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename = $1',
        [fixture.role]
      )
    ).toEqual({ count: 0 });
  } finally {
    await new Promise(resolve => listener.close(resolve));
  }
});
