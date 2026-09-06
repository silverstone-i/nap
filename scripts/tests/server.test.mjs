/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { expect, it } from 'vitest';

it('starts the compiled API, returns an empty 404, and releases its port on shutdown', async () => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: { ...process.env, PORT: String(port) },
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
