/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb, initDb } from '../../src/db/index.js';
import { bootstrapAdmin } from '../../src/scripts/lib/bootstrapAdmin.js';
import type { BootstrapConfig } from '../../src/scripts/lib/bootstrapAdmin.js';
import { OWASP_BASELINE, verifyPassword } from '../../src/util/passwordHash.js';

// This file owns the process's one initDb() call (singleton rule) and works
// on dedicated schemas in the test database, dropped before and after.
const url = process.env.DATABASE_URL_TEST;

const CONFIG: BootstrapConfig = {
  tenantCode: 'NAPT',
  company: 'NAP Test',
  email: 'root@bootstrap.test',
  password: 'test-password',
  argon2: OWASP_BASELINE,
};
const TENANT_SCHEMA = 'napt';

const ADMIN_TABLES = [
  'countries',
  'impersonation_logs',
  'portal_user_tenants',
  'portal_users',
  'schema_migrations',
  'sessions',
  'tenants',
];

const TABLES_IN_SCHEMA_SQL = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = $1
  ORDER BY table_name
`;

async function dropSchemas(): Promise<void> {
  await getDb().none('DROP SCHEMA IF EXISTS admin CASCADE');
  await getDb().none('DROP SCHEMA IF EXISTS $1:name CASCADE', [TENANT_SCHEMA]);
}

describe.skipIf(!url)('bootstrapAdmin (integration)', () => {
  if (!url) {
    console.log('DATABASE_URL_TEST not set; skipping bootstrap integration');
    return;
  }

  beforeAll(async () => {
    initDb(url);
    await dropSchemas();
    await bootstrapAdmin(CONFIG);
  });

  afterAll(async () => {
    await dropSchemas();
    closeDb();
  });

  it('creates the admin schema with all admin-scope tables', async () => {
    const rows = await getDb().manyOrNone<{ table_name: string }>(
      TABLES_IN_SCHEMA_SQL,
      ['admin']
    );
    expect(rows.map(row => row.table_name)).toEqual(ADMIN_TABLES);
  });

  it('creates the root tenant schema with all 24 tenant tables', async () => {
    const rows = await getDb().manyOrNone<{ table_name: string }>(
      TABLES_IN_SCHEMA_SQL,
      [TENANT_SCHEMA]
    );
    const names = rows.map(row => row.table_name);

    expect(names).toHaveLength(25); // 24 models + schema_migrations
    expect(names).toContain('schema_migrations');
    expect(names).toContain('sources');
    expect(names).toContain('employees');
    expect(names).toContain('roles');
    expect(names).toContain('tenant_preferences');
  });

  it('registers the root tenant as active', async () => {
    const tenant = await getDb().tenants.findOneBy([
      { tenant_code: CONFIG.tenantCode },
    ]);

    expect(tenant).not.toBeNull();
    expect(tenant?.schema_name).toBe(TENANT_SCHEMA);
    expect(tenant?.status).toBe('active');
  });

  it('creates a platform admin whose password verifies', async () => {
    const user = await getDb().portalUsers.findOneBy([{ email: CONFIG.email }]);

    expect(user).not.toBeNull();
    expect(user?.user_type).toBe('employee');
    expect(user?.status).toBe('active');
    expect(
      await verifyPassword(user?.password_hash ?? '', CONFIG.password)
    ).toBe(true);
  });

  it('wires the binding to the employee entity in the root schema', async () => {
    const db = getDb();
    const user = await db.portalUsers.findOneBy([{ email: CONFIG.email }]);
    const tenant = await db.tenants.findOneBy([
      { tenant_code: CONFIG.tenantCode },
    ]);
    const binding = await db.portalUserTenants.findOneBy([
      { portal_user_id: user?.id },
    ]);

    expect(binding).not.toBeNull();
    expect(binding?.tenant_id).toBe(tenant?.id);
    expect(binding?.user_type).toBe('employee');
    expect(binding?.status).toBe('active');

    const employee = await db.employees
      .forSchema(TENANT_SCHEMA)
      .findById(binding?.entity_id ?? '');
    expect(employee).not.toBeNull();
    expect(employee?.roles).toEqual(['platform_admin']);
    expect(employee?.is_app_user).toBe(true);

    const source = await db.sources
      .forSchema(TENANT_SCHEMA)
      .findById(employee?.source_id ?? '');
    expect(source?.source_type).toBe('employee');
    expect(source?.table_id).toBe(employee?.id);
  });

  it('is idempotent: a second run migrates and inserts nothing', async () => {
    const countsSql = `
      SELECT
        (SELECT count(*) FROM admin.schema_migrations) AS admin_migrations,
        (SELECT count(*) FROM admin.tenants) AS tenants,
        (SELECT count(*) FROM admin.portal_users) AS users,
        (SELECT count(*) FROM admin.portal_user_tenants) AS bindings
    `;
    const before = await getDb().one<Record<string, string>>(countsSql);

    await bootstrapAdmin(CONFIG);

    const after = await getDb().one<Record<string, string>>(countsSql);
    expect(after).toEqual(before);
  });

  it('completes a partially bootstrapped state on re-run', async () => {
    const db = getDb();
    // Simulate a crash between the portal-user insert and the binding
    // insert, plus a lost source back-link.
    await db.none('DELETE FROM admin.portal_user_tenants');
    await db.none('UPDATE $1:name.sources SET table_id = NULL', [
      TENANT_SCHEMA,
    ]);

    await bootstrapAdmin(CONFIG);

    const user = await db.portalUsers.findOneBy([{ email: CONFIG.email }]);
    const binding = await db.portalUserTenants.findOneBy([
      { portal_user_id: user?.id },
    ]);
    expect(binding).not.toBeNull();
    expect(binding?.status).toBe('active');

    const employee = await db.employees
      .forSchema(TENANT_SCHEMA)
      .findById(binding?.entity_id ?? '');
    const source = await db.sources
      .forSchema(TENANT_SCHEMA)
      .findById(employee?.source_id ?? '');
    expect(source?.table_id).toBe(employee?.id);
  });
});
