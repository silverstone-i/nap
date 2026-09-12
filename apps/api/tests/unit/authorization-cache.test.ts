/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { cachedLookup } from '../../src/services/authorizationCache.js';
import {
  cacheTransaction,
  publishCache,
} from '../../src/db/authorizationCache.js';
import { resolveCacheConfiguration } from '../../src/util/env.js';

/** Does: Creates isolated cache state. Called by: lookup unit tests. */
function fixture() {
  const entries = new Map<string, string>();
  const cache = {
    namespace: 'unit',
    read: vi.fn((key: string) => Promise.resolve(entries.get(key) ?? null)),
    write: vi.fn((key: string, value: string) => {
      entries.set(key, value);
      return Promise.resolve();
    }),
    close: async () => {},
  };
  const state = { cache, database: 'cell-a', fills: new Map<string, string>() };
  const tx = { [cacheTransaction]: state };
  return { entries, cache, state, tx };
}
it('requires live revisions on hits and isolates keys by database, principal and revision', async () => {
  const f = fixture();
  let current = 'v1';
  const revision = vi.fn(() => Promise.resolve(current));
  const load = vi.fn(() => Promise.resolve(['read']));
  const lookup = () =>
    cachedLookup(
      f.tx,
      'grants',
      'tenant.user',
      z.array(z.string()),
      revision,
      load
    );
  await lookup();
  expect(f.cache.write).not.toHaveBeenCalled();
  await publishCache(f.state);
  await lookup();
  expect(load).toHaveBeenCalledTimes(1);
  expect(revision).toHaveBeenCalledTimes(3);
  current = 'v2';
  await lookup();
  expect(load).toHaveBeenCalledTimes(2);
  f.state.database = 'cell-b';
  await lookup();
  expect(load).toHaveBeenCalledTimes(3);
});
it('discards unstable fills and handles invalid envelopes and cache errors', async () => {
  const f = fixture();
  let counter = 0;
  await cachedLookup(
    f.tx,
    'test',
    'actor',
    z.string(),
    () => Promise.resolve(String(counter++)),
    () => Promise.resolve('ok')
  );
  expect(f.state.fills.size).toBe(0);
  for (const raw of [
    'bad-json',
    JSON.stringify({ key: 'other', value: 'grant' }),
    JSON.stringify({ key: 'other', value: 3 }),
  ]) {
    f.cache.read.mockResolvedValueOnce(raw);
    expect(
      await cachedLookup(
        f.tx,
        'test',
        'actor',
        z.string(),
        () => Promise.resolve('v1'),
        () => Promise.resolve('database')
      )
    ).toBe('database');
  }
  f.cache.read.mockRejectedValueOnce(new Error('offline'));
  expect(
    await cachedLookup(
      f.tx,
      'test',
      'actor',
      z.string(),
      () => Promise.resolve('v1'),
      () => Promise.resolve('database')
    )
  ).toBe('database');
  f.cache.write.mockRejectedValueOnce(new Error('offline'));
  await expect(publishCache(f.state)).resolves.toBeUndefined();
});
it('does not read Redis when database freshness fails or is absent', async () => {
  const f = fixture();
  await expect(
    cachedLookup(
      f.tx,
      'test',
      'actor',
      z.string(),
      () => Promise.reject(new Error('database')),
      () => Promise.resolve('bad')
    )
  ).rejects.toThrow('database');
  expect(
    await cachedLookup(
      f.tx,
      'test',
      'actor',
      z.string(),
      () => Promise.resolve(undefined),
      () => Promise.resolve('live')
    )
  ).toBe('live');
  expect(f.cache.read).not.toHaveBeenCalled();
});
it('validates configuration without printing URLs and isolates test configuration', () => {
  expect(
    resolveCacheConfiguration({
      NODE_ENV: 'test',
      REDIS_URL_PROD: 'redis://production',
    }).url
  ).toBeUndefined();
  expect(
    resolveCacheConfiguration({
      NODE_ENV: 'production',
      REDIS_CACHE_ENABLED_PROD: 'false',
    }).url
  ).toBeUndefined();
  expect(() => resolveCacheConfiguration({ NODE_ENV: 'production' })).toThrow(
    'required'
  );
  expect(() =>
    resolveCacheConfiguration({ REDIS_URL_DEV: 'https://private:secret@host' })
  ).toThrow('Invalid Redis URL');
  expect(() =>
    resolveCacheConfiguration({ REDIS_CACHE_NAMESPACE_DEV: 'bad:namespace' })
  ).toThrow('Invalid REDIS_CACHE_NAMESPACE');
});

it('normalizes cold, warm, and fallback results without publishing unstable fills', async () => {
  const f = fixture();
  const schema = z.object({ grant: z.string() });
  const raw = { grant: 'read', databaseOnly: 'metadata' };
  const expected = { grant: 'read' };
  const load = vi.fn(() => Promise.resolve(raw));
  const revision = vi.fn<() => Promise<string | undefined>>(() =>
    Promise.resolve('v1')
  );
  /** Does: Reads the same derived record across cache states. Called by: this parity regression. */
  const lookup = () =>
    cachedLookup(f.tx, 'grants', 'actor', schema, revision, load);

  expect(await lookup()).toEqual(expected);
  await publishCache(f.state);
  expect(await lookup()).toEqual(expected);
  expect(load).toHaveBeenCalledTimes(1);
  f.state.fills.clear();

  f.cache.read.mockRejectedValueOnce(new Error('offline'));
  expect(await lookup()).toEqual(expected);
  f.cache.read.mockResolvedValueOnce('malformed');
  expect(await lookup()).toEqual(expected);
  f.state.fills.clear();

  revision.mockResolvedValueOnce('v2').mockResolvedValueOnce('v3');
  expect(await lookup()).toEqual(expected);
  expect(f.state.fills.size).toBe(0);

  const reads = f.cache.read.mock.calls.length;
  revision.mockResolvedValueOnce(undefined);
  expect(await lookup()).toEqual(expected);
  expect(f.cache.read).toHaveBeenCalledTimes(reads);
  expect(f.state.fills.size).toBe(0);
  expect(raw).toEqual({ grant: 'read', databaseOnly: 'metadata' });
});
