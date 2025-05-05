import { jest } from '@jest/globals';
import { db, pgp } from '../../../src/db/db.js';
import * as migrateScript from '../../../scripts/runMigrate.js';

// beforeAll(() => {
//   jest.spyOn(console, 'log').mockImplementation(() => {});
//   jest.spyOn(console, 'error').mockImplementation(() => {});
// });

// afterAll(() => {
//   console.log.mockRestore();
//   console.error.mockRestore();
// });

describe('Migration Script', () => {
  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await db.none('DROP SCHEMA IF EXISTS admin CASCADE; CREATE SCHEMA admin;');
  });

  afterAll(async () => {
    await db.$pool.end();

    console.log.mockRestore();
    console.error.mockRestore();
  });

  test('should create all tables without error', async () => {
    await migrateScript.runMigrate(db, pgp, true);

    const result = await db.oneOrNone(
      "SELECT to_regclass('admin.tenants') AS table"
    );
    expect(result.table).toBe('admin.tenants');
  });

  test('should handle errors during migration and log appropriately', async () => {
    const mockDb = {
      none: jest.fn().mockResolvedValue(undefined),
      one: jest.fn().mockResolvedValue({ search_path: 'admin' }),
      'admin.cyclic': {
        schema: {
          dbSchema: 'admin',
          table: 'cyclic',
          constraints: {
            foreignKeys: [],
          },
        },
        createTable: jest.fn().mockImplementation(() => {
          throw new Error('Simulated createTable error');
        }),
      },
    };
    const mockPgp = { end: jest.fn() };

    await expect(
      migrateScript.runMigrate(mockDb, mockPgp, true)
    ).rejects.toThrow('Simulated createTable error');
  });

  test('should process models without foreign keys (nap_users)', async () => {
    await migrateScript.runMigrate(db, pgp, true);

    const napUsersModel = db['napUsers'];

    // Ensure the model exists and has no foreign keys
    expect(napUsersModel).toBeDefined();
    expect(napUsersModel.schema.constraints?.foreignKeys).toBeUndefined();

    // Run migration with only nap_users
    const filteredDb = {
      none: jest.fn().mockResolvedValue(undefined),
      one: jest.fn().mockResolvedValue({ search_path: 'admin' }),
      'admin.nap_users': napUsersModel,
    };
    await migrateScript.runMigrate(filteredDb, pgp, true);
  });

  test('should throw an error for cyclic dependencies', async () => {
    const mockDb = {
      none: jest.fn().mockResolvedValue(undefined),
      one: jest.fn().mockResolvedValue({ search_path: 'admin' }),
      'admin.a': {
        schemaName: 'admin',
        tableName: 'a',
        schema: {
          dbSchema: 'admin',
          table: 'a',
          constraints: {
            foreignKeys: [{ references: { schema: 'admin', table: 'b' } }],
          },
        },
        createTable: jest.fn(),
      },
      'admin.b': {
        schemaName: 'admin',
        tableName: 'b',
        schema: {
          dbSchema: 'admin',
          table: 'b',
          constraints: {
            foreignKeys: [{ references: { schema: 'admin', table: 'a' } }],
          },
        },
        createTable: jest.fn(),
      },
    };
    const mockPgp = { end: jest.fn() };

    await expect(
      migrateScript.runMigrate(mockDb, mockPgp, true)
    ).rejects.toThrow('Cyclic dependency detected');
  });
});
