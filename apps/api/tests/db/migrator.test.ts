/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ApplyAllResult, MigrationManagerOptions } from 'pg-schemata';
import { describe, expect, it } from 'vitest';

import {
  migrateAdmin,
  migrateAllTenants,
  migrateTenant,
  TenantMigrationsError,
} from '../../src/db/index.js';
import type { NapModule, SchemaScope } from '../../src/db/index.js';

class FakeRepo {}

function makeModule(name: string, schemaScope: SchemaScope): NapModule {
  return {
    name,
    schemaScope,
    licensable: false,
    models: { [name]: FakeRepo },
    migrations: [],
  };
}

const adminModule = makeModule('auth', 'admin');
const tenantModule = makeModule('core-tenant', 'tenant');
const modules = [adminModule, tenantModule];

function applied(schema: string): ApplyAllResult {
  return { schema, dryRun: false, moduleOrder: [], pending: [], applied: [] };
}

/** Records every manager the migrator constructs and what it ran. */
function fakeManagerFactory(failFor: Set<string> = new Set()) {
  const constructed: MigrationManagerOptions[] = [];
  const ran: string[] = [];
  const createManager = (options: MigrationManagerOptions) => {
    constructed.push(options);
    return {
      applyAll: () => {
        const schema = options.schema ?? 'public';
        if (failFor.has(schema)) {
          return Promise.reject(new Error(`boom in ${schema}`));
        }
        ran.push(schema);
        return Promise.resolve(applied(schema));
      },
    };
  };
  return { constructed, ran, createManager };
}

describe('migrateAdmin', () => {
  it('runs only admin-scope modules against the admin schema', async () => {
    const factory = fakeManagerFactory();

    const result = await migrateAdmin({
      modules,
      createManager: factory.createManager,
    });

    expect(result).toEqual(applied('admin'));
    expect(factory.constructed).toHaveLength(1);
    expect(factory.constructed[0]?.schema).toBe('admin');
    expect(factory.constructed[0]?.modules).toEqual([adminModule]);
  });
});

describe('migrateTenant', () => {
  it('runs only tenant-scope modules against the given schema', async () => {
    const factory = fakeManagerFactory();

    const result = await migrateTenant('acme', {
      modules,
      createManager: factory.createManager,
    });

    expect(result).toEqual(applied('acme'));
    expect(factory.constructed).toHaveLength(1);
    expect(factory.constructed[0]?.schema).toBe('acme');
    expect(factory.constructed[0]?.modules).toEqual([tenantModule]);
  });

  it('rejects a blank schema name', async () => {
    const factory = fakeManagerFactory();

    await expect(
      migrateTenant('  ', { modules, createManager: factory.createManager })
    ).rejects.toThrow('requires a schema name');
    expect(factory.constructed).toHaveLength(0);
  });

  it('rejects the admin schema as a target', async () => {
    const factory = fakeManagerFactory();

    await expect(
      migrateTenant('admin', { modules, createManager: factory.createManager })
    ).rejects.toThrow('must not target the admin schema');
    expect(factory.constructed).toHaveLength(0);
  });
});

describe('migrateAllTenants', () => {
  it('migrates every listed schema sequentially, in order', async () => {
    const factory = fakeManagerFactory();

    const results = await migrateAllTenants({
      modules,
      createManager: factory.createManager,
      listTenantSchemas: () => Promise.resolve(['acme', 'globex', 'nap']),
    });

    expect(factory.ran).toEqual(['acme', 'globex', 'nap']);
    expect(results).toEqual([
      { schemaName: 'acme', status: 'migrated', result: applied('acme') },
      { schemaName: 'globex', status: 'migrated', result: applied('globex') },
      { schemaName: 'nap', status: 'migrated', result: applied('nap') },
    ]);
  });

  it('returns an empty report when no tenants are active', async () => {
    const factory = fakeManagerFactory();

    const results = await migrateAllTenants({
      modules,
      createManager: factory.createManager,
      listTenantSchemas: () => Promise.resolve([]),
    });

    expect(results).toEqual([]);
    expect(factory.constructed).toHaveLength(0);
  });

  it('continues past a failure, then throws with the full report', async () => {
    const factory = fakeManagerFactory(new Set(['globex']));
    const run = migrateAllTenants({
      modules,
      createManager: factory.createManager,
      listTenantSchemas: () => Promise.resolve(['acme', 'globex', 'nap']),
    });

    const error = await run.then(
      () => {
        throw new Error('expected migrateAllTenants to reject');
      },
      (thrown: unknown) => thrown
    );

    expect(error).toBeInstanceOf(TenantMigrationsError);
    const { results, message } = error as TenantMigrationsError;
    expect(message).toContain('1 of 3');
    expect(message).toContain('globex');
    expect(factory.ran).toEqual(['acme', 'nap']);
    expect(results.map(result => result.status)).toEqual([
      'migrated',
      'failed',
      'migrated',
    ]);
  });

  it('propagates a tenant enumeration failure as-is', async () => {
    const factory = fakeManagerFactory();

    await expect(
      migrateAllTenants({
        modules,
        createManager: factory.createManager,
        listTenantSchemas: () => Promise.reject(new Error('no admin.tenants')),
      })
    ).rejects.toThrow('no admin.tenants');
    expect(factory.constructed).toHaveLength(0);
  });
});
