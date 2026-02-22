/**
 * @file Integration tests for admin bootstrap migration
 * @module tests/integration/bootstrap
 *
 * Runs the bootstrap migration against the test database and verifies:
 * - Admin schema tables are created
 * - Root tenant is seeded
 * - Super user is seeded
 * - Re-run is idempotent
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { bootstrapAdmin, cleanupTestDb, DB } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_TENANT_CODE = process.env.ROOT_TENANT_CODE || 'NAP';
const ROOT_COMPANY = process.env.ROOT_COMPANY || 'NapSoft LLC';

describe('Bootstrap admin migration', () => {
  let db;

  beforeAll(async () => {
    await cleanupTestDb();
    db = await bootstrapAdmin();
  }, 30000);

  afterAll(async () => {
    await cleanupTestDb();
  }, 15000);

  test('creates admin.tenants table', async () => {
    const result = await db.oneOrNone(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'admin' AND table_name = 'tenants'",
    );
    expect(result).not.toBeNull();
    expect(result.table_name).toBe('tenants');
  });

  test('creates admin.nap_users table', async () => {
    const result = await db.oneOrNone(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'admin' AND table_name = 'nap_users'",
    );
    expect(result).not.toBeNull();
  });

  test('creates admin.impersonation_logs table', async () => {
    const result = await db.oneOrNone(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'admin' AND table_name = 'impersonation_logs'",
    );
    expect(result).not.toBeNull();
  });

  test('creates admin.match_review_logs table', async () => {
    const result = await db.oneOrNone(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'admin' AND table_name = 'match_review_logs'",
    );
    expect(result).not.toBeNull();
  });

  test(`seeds root tenant (${ROOT_TENANT_CODE})`, async () => {
    const tenant = await db.oneOrNone('SELECT * FROM admin.tenants WHERE tenant_code = $1', [ROOT_TENANT_CODE]);
    expect(tenant).not.toBeNull();
    expect(tenant.company).toBe(ROOT_COMPANY);
    expect(tenant.schema_name).toBe(ROOT_TENANT_CODE.toLowerCase());
    expect(tenant.status).toBe('active');
    expect(tenant.tier).toBe('enterprise');
  });

  test('seeds root super user', async () => {
    const user = await db.oneOrNone('SELECT * FROM admin.nap_users WHERE email = $1', [ROOT_EMAIL]);
    expect(user).not.toBeNull();
    expect(user.status).toBe('active');
    expect(user.entity_type).toBeNull();
    expect(user.entity_id).toBeNull();
    expect(user.password_hash).toBeDefined();
    expect(user.password_hash.startsWith('$2')).toBe(true); // bcrypt hash
  });

  test('nap_users.tenant_id references the root tenant', async () => {
    const tenant = await db.oneOrNone('SELECT id FROM admin.tenants WHERE tenant_code = $1', [ROOT_TENANT_CODE]);
    const user = await db.oneOrNone('SELECT tenant_id FROM admin.nap_users WHERE email = $1', [ROOT_EMAIL]);
    expect(user).not.toBeNull();
    expect(user.tenant_id).toBe(tenant.id);
  });

  test('nap_users does NOT have tenant_code column (PRD §3.2.2)', async () => {
    const cols = await db.manyOrNone(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'admin' AND table_name = 'nap_users'",
    );
    const colNames = cols.map((c) => c.column_name);
    expect(colNames).not.toContain('tenant_code');
    expect(colNames).not.toContain('user_name');
    expect(colNames).not.toContain('full_name');
    expect(colNames).not.toContain('role');
  });

  test('nap_users has entity_type and entity_id columns (PRD §3.2.2)', async () => {
    const cols = await db.manyOrNone(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'admin' AND table_name = 'nap_users'",
    );
    const colNames = cols.map((c) => c.column_name);
    expect(colNames).toContain('entity_type');
    expect(colNames).toContain('entity_id');
  });

  test('re-running bootstrap is idempotent', async () => {
    const { default: bootstrapMigration } = await import(
      '../../src/modules/auth/schema/migrations/202502110001_bootstrapAdmin.js'
    );

    const models = {};
    for (const [key, ModelClass] of Object.entries((await import('../../src/db/repositories.js')).default)) {
      models[key] = new ModelClass(db, DB.pgp, null);
    }

    await bootstrapMigration.up({
      schema: 'admin',
      models,
      db,
      ensureExtensions: async (exts) => {
        for (const ext of exts) {
          await db.none(`CREATE EXTENSION IF NOT EXISTS "${ext}" CASCADE`);
        }
      },
    });

    const tenantCount = await db.one('SELECT COUNT(*)::int AS count FROM admin.tenants');
    expect(tenantCount.count).toBe(1);

    const userCount = await db.one('SELECT COUNT(*)::int AS count FROM admin.nap_users');
    expect(userCount.count).toBe(1);
  });
});
