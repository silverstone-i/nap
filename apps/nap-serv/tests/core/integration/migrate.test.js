import { jest } from '@jest/globals';
import { db, pgp } from '../../../src/db/db.js';
import * as migrateScript from '../../../scripts/migrate.js';

describe('Migration Script', () => {
  beforeAll(async () => {
    await db.none('DROP SCHEMA IF EXISTS admin CASCADE; CREATE SCHEMA admin;');
  });

  afterAll(async () => {
    await db.$pool.end();
  });

  test('should create all tables without error', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await migrateScript.migrate(db, pgp, true);

    const result = await db.oneOrNone(
      "SELECT to_regclass('admin.tenants') AS table"
    );
    expect(result.table).toBe('admin.tenants');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('should handle errors during migration and log appropriately', async () => {
    const mockDb = {
      'admin.cyclic': {
        schema: {
          dbSchema: 'admin',
          table: 'cyclic',
          constraints: {
            foreignKeys: [{ references: { schema: 'admin', table: 'cyclic' } }],
          },
        },
        createTable: jest.fn().mockImplementation(() => {
          throw new Error('Simulated createTable error');
        }),
      },
    };
    const mockPgp = { end: jest.fn() };

    const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(migrateScript.migrate(mockDb, mockPgp, true)).rejects.toThrow(
      'Simulated createTable error'
    );

    spyLog.mockRestore();
    spyError.mockRestore();
  });

  test('should process models without foreign keys (nap_users)', async () => {
    await migrateScript.migrate(db, pgp, true);

    const napUsersModel = db['napUsers'];

    // Ensure the model exists and has no foreign keys
    expect(napUsersModel).toBeDefined();
    expect(napUsersModel.schema.constraints?.foreignKeys).toBeUndefined();

    // Spy to suppress logs
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Run migration with only nap_users
    const filteredDb = { 'admin.nap_users': napUsersModel };
    await migrateScript.migrate(filteredDb, pgp, true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('should throw an error for cyclic dependencies', async () => {
    const mockDb = {
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

    await expect(migrateScript.migrate(mockDb, mockPgp, true)).rejects.toThrow(
      'Cyclic dependency detected'
    );
  });
});
