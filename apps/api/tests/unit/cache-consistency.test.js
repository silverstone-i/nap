/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CacheConsistencyError,
  normalizeRevisionKeys,
  revisionVectorsMatch,
} from '../../src/modules/admin-tenancy/domain/cache.js';
import {
  cacheRedisKey,
  createRevisionCache,
} from '../../src/infrastructure/cache/index.js';

const user = '11111111-1111-4111-8111-111111111111';
const tenant = '22222222-2222-4222-8222-222222222222';
const keys = [
  { domain: 'tenant', entity: tenant },
  { domain: 'user', entity: user },
];
const vector = [
  { domain: 'tenant', entity: tenant, revision: '2' },
  { domain: 'user', entity: user, revision: '3' },
];

function admin({ current = vector, currentFailure, txFailure } = {}) {
  const currentFn = vi.fn(async () => {
    if (currentFailure) throw currentFailure;
    return current;
  });
  const tx = { cache_revisions: { current: currentFn } };
  return {
    pgp: {
      txMode: {
        isolationLevel: { repeatableRead: 'repeatable-read' },
        TransactionMode: class {
          constructor(options) {
            this.options = options;
          }
        },
      },
    },
    db: {
      cache_revisions: { current: currentFn },
      tx: vi.fn(async (_options, operation) => {
        if (txFailure) throw txFailure;
        return operation(tx);
      }),
    },
    currentFn,
  };
}

function redis({ failures = {} } = {}) {
  const values = new Map();
  const client = {
    isOpen: false,
    on: vi.fn(),
    connect: vi.fn(async () => {
      if (failures.connect) throw new Error('private connection detail');
      client.isOpen = true;
    }),
    get: vi.fn(async key => {
      if (failures.get) throw new Error('private read detail');
      return values.get(key) ?? null;
    }),
    set: vi.fn(async (key, value) => {
      if (failures.set) throw new Error('private write detail');
      values.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async key => {
      if (failures.del) throw new Error('private delete detail');
      return values.delete(key) ? 1 : 0;
    }),
    close: vi.fn(async () => {
      if (failures.close) throw new Error('private close detail');
      client.isOpen = false;
    }),
    destroy: vi.fn(() => {
      client.isOpen = false;
    }),
  };
  return { client, values, factory: vi.fn(() => client) };
}

describe('revision keys and vectors', () => {
  it('normalizes UUIDs and orders keys canonically', () => {
    expect(
      normalizeRevisionKeys([
        { domain: 'user', entity: user.toUpperCase() },
        { domain: 'tenant', entity: tenant },
      ])
    ).toEqual(keys);
  });

  it.each([
    [],
    [{ domain: 'unknown', entity: user }],
    [{ domain: 'user', entity: 'not-a-uuid' }],
    [{ domain: 'user', entity: user, extra: true }],
    [
      { domain: 'user', entity: user },
      { domain: 'user', entity: user },
    ],
  ])('rejects malformed or duplicate keys %j', value =>
    expect(() => normalizeRevisionKeys(value)).toThrow(CacheConsistencyError)
  );

  it('requires an exact complete revision vector', () => {
    expect(revisionVectorsMatch(vector, vector)).toBe(true);
    expect(revisionVectorsMatch(vector.slice(0, 1), vector)).toBe(false);
    expect(
      revisionVectorsMatch(
        vector.map((entry, index) =>
          index ? { ...entry, revision: '4' } : entry
        ),
        vector
      )
    ).toBe(false);
  });

  it('hashes identities and dependencies instead of exposing them', () => {
    const derived = cacheRedisKey('nap_test', 'secret@example.com', keys);
    expect(derived).toMatch(/^nap_test:authorization:[a-f0-9]{64}$/);
    expect(derived).not.toContain('secret');
    expect(cacheRedisKey('nap_test', user, keys)).not.toBe(
      cacheRedisKey('nap_test', tenant, keys)
    );
  });
});

describe('revision cache', () => {
  it('loads once and reuses only a matching cached vector', async () => {
    const database = admin();
    const store = redis();
    const cache = createRevisionCache({
      admin: database,
      enabled: true,
      url: 'redis://cache.test',
      namespace: 'nap_test',
      clientFactory: store.factory,
      logger: vi.fn(),
    });
    const loader = vi.fn(async () => ({ allowed: true }));
    expect(await cache.getOrLoad('authorization', keys, loader)).toEqual({
      allowed: true,
    });
    expect(await cache.getOrLoad('authorization', keys, loader)).toEqual({
      allowed: true,
    });
    expect(loader).toHaveBeenCalledOnce();
    expect(database.db.tx).toHaveBeenCalledOnce();
    expect(store.client.set).toHaveBeenCalledOnce();
  });

  it('discards stale and malformed payloads before refilling', async () => {
    const database = admin();
    const store = redis();
    const cache = createRevisionCache({
      admin: database,
      enabled: true,
      url: 'redis://cache.test',
      namespace: 'nap_test',
      clientFactory: store.factory,
      logger: vi.fn(),
    });
    const key = cacheRedisKey(
      'nap_test',
      'authorization',
      normalizeRevisionKeys(keys)
    );
    store.values.set(key, '{bad json');
    const loader = vi.fn(async () => 'fresh');
    expect(await cache.getOrLoad('authorization', keys, loader)).toBe('fresh');
    store.values.set(
      key,
      JSON.stringify({ value: 'stale', vector: [{ ...vector[0] }] })
    );
    expect(await cache.getOrLoad('authorization', keys, loader)).toBe('fresh');
    expect(loader).toHaveBeenCalledTimes(2);
    expect(store.client.del).toHaveBeenCalledTimes(2);
  });

  it.each(['connect', 'get', 'set'])(
    'falls back to PostgreSQL when Redis %s fails',
    async failure => {
      const database = admin();
      const store = redis({ failures: { [failure]: true } });
      const warnings = vi.fn();
      const cache = createRevisionCache({
        admin: database,
        enabled: true,
        url: 'redis://cache.test',
        clientFactory: store.factory,
        logger: warnings,
      });
      expect(
        await cache.getOrLoad('authorization', keys, async () => 'database')
      ).toBe('database');
      expect(warnings).toHaveBeenCalledWith('REDIS_CACHE_UNAVAILABLE');
    }
  );

  it('uses PostgreSQL directly when Redis is disabled', async () => {
    const database = admin();
    const store = redis();
    const cache = createRevisionCache({
      admin: database,
      clientFactory: store.factory,
    });
    expect(await cache.getOrLoad('one', keys, async () => 1)).toBe(1);
    expect(await cache.getOrLoad('one', keys, async () => 2)).toBe(2);
    expect(store.factory).not.toHaveBeenCalled();
  });

  it('propagates loader errors and fails closed on PostgreSQL errors', async () => {
    const loaderError = new Error('loader failure');
    const cache = createRevisionCache({ admin: admin() });
    await expect(
      cache.getOrLoad('authorization', keys, async () => {
        throw loaderError;
      })
    ).rejects.toBe(loaderError);
    const unavailable = createRevisionCache({
      admin: admin({ txFailure: new Error('private database detail') }),
    });
    await expect(
      unavailable.getOrLoad('authorization', keys, async () => 'unused')
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('rejects loader values that JSON cannot preserve', async () => {
    const cache = createRevisionCache({ admin: admin() });
    for (const value of [undefined, 1n, Number.NaN, { nested: undefined }])
      await expect(
        cache.getOrLoad('authorization', keys, async () => value)
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('closes an open Redis client without exposing close failures', async () => {
    const database = admin();
    const store = redis({ failures: { close: true } });
    const warnings = vi.fn();
    const cache = createRevisionCache({
      admin: database,
      enabled: true,
      url: 'redis://cache.test',
      clientFactory: store.factory,
      logger: warnings,
    });
    await cache.getOrLoad('authorization', keys, async () => 'value');
    await cache.close();
    expect(warnings).toHaveBeenCalledWith('REDIS_CACHE_CLOSE_FAILED');
    expect(store.client.destroy).toHaveBeenCalled();
  });
});
