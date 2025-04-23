import { jest } from '@jest/globals';
import { db, pgp } from '../../../src/db/db.js';
import * as migrateScript from '../../../src/db/migrate.js';

describe('Migration Script', () => {
  beforeAll(async () => {
    await db.none('DROP SCHEMA IF EXISTS admin CASCADE; CREATE SCHEMA admin;');
  });

  afterAll(async () => {
    await pgp.end();
  });

  test('should create all tables without error', async () => {
    // Spy on console logs to suppress noisy output
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await migrateScript.migrate();

    // Check that at least one table exists (replace 'tenants' with any expected table)
    const result = await db.oneOrNone("SELECT to_regclass('admin.tenants') AS table");
    expect(result.table).toBe('admin.tenants');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('should handle errors during migration and log appropriately', async () => {
    const spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const mockDb = {
      'admin.cyclic': {
        schema: {
          dbSchema: 'admin',
          table: 'cyclic',
          constraints: {
            foreignKeys: [{ references: { schema: 'admin', table: 'cyclic' } }]
          }
        },
        createTable: jest.fn().mockImplementation(() => {
          throw new Error('Simulated createTable error');
        })
      }
    };
    const mockPgp = { end: jest.fn() };

    await migrateScript.migrate(mockDb, mockPgp);

    expect(spyError).toHaveBeenCalled();
    expect(spyLog).toHaveBeenCalledWith(expect.stringContaining('Dependency graph written'));

    spyLog.mockRestore();
    spyError.mockRestore();
  });
});
