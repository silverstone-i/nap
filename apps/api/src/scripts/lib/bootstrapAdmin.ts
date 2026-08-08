/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Logger } from 'pg-schemata';
import { getDb, migrateAdmin, migrateTenant } from '../../db/index.js';
import { hashPassword } from '../../util/passwordHash.js';
import type { Argon2Params } from '../../util/passwordHash.js';

/** Root identity and tenant settings, resolved from env by the entrypoint. */
export interface BootstrapConfig {
  tenantCode: string;
  company: string;
  email: string;
  password: string;
  argon2: Argon2Params;
}

/**
 * Takes an empty database to a working platform: admin schema and tables,
 * the root tenant with a fully migrated tenant schema, and one platform
 * admin who can log in (PRD 0002). Every step is idempotent — a re-run
 * applies zero migrations and inserts nothing. Data lives here and not in
 * migrations (ADR-0005: migrations carry DDL only).
 *
 * Requires `initDb()` to have run; errors propagate so the entrypoint owns
 * exit codes.
 */
export async function bootstrapAdmin(
  config: BootstrapConfig,
  logger: Logger | null = null
): Promise<void> {
  const db = getDb();
  const schemaName = config.tenantCode.toLowerCase();

  // pg-schemata's manager only creates schemas as a side effect of its
  // tracking table; PRD 0002 wants the admin schema created explicitly.
  await db.none('CREATE SCHEMA IF NOT EXISTS admin');
  await migrateAdmin({ logger });

  let tenant = await db.tenants.findOneBy([{ tenant_code: config.tenantCode }]);
  if (tenant === null) {
    tenant = await db.tenants.insert({
      tenant_code: config.tenantCode,
      company: config.company,
      schema_name: schemaName,
      status: 'active',
    });
    logger?.info?.(`Created root tenant "${config.tenantCode}"`, {
      schemaName,
    });
  }

  await db.none('CREATE SCHEMA IF NOT EXISTS $1:name', [schemaName]);
  await migrateTenant(schemaName, { logger });

  const existingUser = await db.portalUsers.findOneBy([
    { email: config.email },
  ]);
  if (existingUser !== null) {
    logger?.info?.(`Platform admin "${config.email}" already exists`);
    return;
  }

  const portalUser = await db.portalUsers.insert({
    email: config.email,
    // The shared argon2id hasher — the only path that writes password_hash
    // (ADR-0015 decision 4).
    password_hash: await hashPassword(config.password, config.argon2),
    user_type: 'employee',
    status: 'active',
  });

  const sources = db.sources.forSchema(schemaName);
  const employees = db.employees.forSchema(schemaName);
  const source = await sources.insert({ source_type: 'employee' });
  const employee = await employees.insert({
    source_id: source.id,
    first_name: 'Platform',
    last_name: 'Admin',
    code: 'ROOT',
    roles: ['platform_admin'],
    is_app_user: true,
  });
  // updateWhere, not update(id, …): update() writes the full column set and
  // nulls out anything absent from the DTO.
  await sources.updateWhere([{ id: source.id }], { table_id: employee.id });

  await db.portalUserTenants.insert({
    portal_user_id: portalUser.id,
    tenant_id: tenant.id,
    user_type: 'employee',
    entity_id: employee.id,
    status: 'active',
  });
  logger?.info?.(`Created platform admin "${config.email}"`);
}
