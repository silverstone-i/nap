/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { spawn } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from 'redis';
import { createAuthorizationCache } from '../../src/db/redis.js';

/** Does: Reserves a loopback port. Called by: the disposable Redis fixture. */
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing Redis port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}
/**
 * Does: Creates isolated Redis access through a disconnectable TCP proxy.
 * Called by: cache acceptance tests and disposable browser verification.
 * Why: outage tests must not stop a shared CI service or erase another test's keys.
 */
export async function redisFixture() {
  let child: ReturnType<typeof spawn> | undefined;
  let url = process.env.REDIS_URL_TEST;
  if (!url) {
    const port = await freePort();
    url = `redis://127.0.0.1:${port}`;
    child = spawn(
      'redis-server',
      [
        '--bind',
        '127.0.0.1',
        '--port',
        String(port),
        '--save',
        '',
        '--appendonly',
        'no',
      ],
      { stdio: 'ignore' }
    );
    child.on('error', () => {});
  }
  const direct = createClient({
    url,
    socket: { connectTimeout: 1000, reconnectStrategy: false },
  });
  direct.on('error', () => {});
  let connected = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await direct.connect();
      connected = true;
      break;
    } catch {
      await delay(50);
    }
  }
  if (!connected) {
    child?.kill();
    throw new Error('Redis fixture unavailable');
  }
  const target = new URL(url);
  const upstreamHost = target.hostname;
  const upstreamPort = Number(target.port || 6379);
  if (target.protocol !== 'redis:')
    throw new Error('Redis fixture requires a local plaintext test service');
  const sockets = new Set<Socket>();
  let available = true;
  let stalled = false;
  const proxy = createServer(incoming => {
    if (!available) {
      incoming.destroy();
      return;
    }
    const upstream = createConnection({
      host: upstreamHost,
      port: upstreamPort,
    });
    sockets.add(incoming);
    sockets.add(upstream);
    for (const socket of [incoming, upstream]) {
      socket.on('error', () => {});
      socket.on('close', () => {
        sockets.delete(socket);
        incoming.destroy();
        upstream.destroy();
      });
    }
    if (!stalled) {
      incoming.pipe(upstream);
      upstream.pipe(incoming);
    }
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const address = proxy.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing proxy port');
  target.hostname = '127.0.0.1';
  target.port = String(address.port);
  const namespace = `test_${randomUUID()}`;
  const cache = createAuthorizationCache({ url: target.toString(), namespace });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await cache.read(`nap:authz:v1:${namespace}:probe`);
      break;
    } catch {
      if (attempt === 49) throw new Error('Cache proxy readiness deadline');
      await delay(50);
    }
  }
  return {
    cache,
    direct,
    namespace,
    url: target.toString(),
    /** Does: Cuts only this fixture's Redis connections. Called by: outage tests. */
    disconnect() {
      available = false;
      for (const socket of sockets) socket.destroy();
    },
    /** Does: Restores this fixture's Redis connections. Called by: recovery tests. */
    reconnect() {
      available = true;
      stalled = false;
    },
    /** Does: Stalls current command traffic. Called by: deadline tests. */
    stall() {
      stalled = true;
      for (const socket of sockets) socket.pause();
    },
    /** Does: Lists only this fixture's keys. Called by: cache assertions and cleanup. */
    keys() {
      return direct.keys(`nap:authz:v1:${namespace}:*`);
    },
    /** Does: Removes fixture keys and closes its processes and sockets. Called by: suite cleanup. */
    async cleanup() {
      await cache.close();
      const keys = await direct.keys(`nap:authz:v1:${namespace}:*`);
      if (keys.length) await direct.del(keys);
      direct.destroy();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => proxy.close(() => resolve()));
      if (child && child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
    },
  };
}
