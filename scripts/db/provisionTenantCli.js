/**
 * @file CLI script to provision a tenant — inserts tenant record and calls provisionTenant()
 * @module nap-serv/scripts/db/provisionTenantCli
 *
 * Usage:
 *   cross-env NODE_ENV=development node scripts/db/provisionTenantCli.js \
 *     --tenant-code SRH \
 *     --company "Sterling Ridge Homes, LLC" \
 *     --schema-name srh
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { parseArgs } from 'node:util';

// Walk up to find .env (same pattern as setupAdmin.js)
let dir = process.cwd();
while (dir !== dirname(dir)) {
  const envPath = resolve(dir, '.env');
  if (existsSync(envPath)) {
    dotenvConfig({ path: envPath });
    break;
  }
  dir = dirname(dir);
}

const { values } = parseArgs({
  options: {
    'tenant-code': { type: 'string' },
    'company': { type: 'string' },
    'schema-name': { type: 'string' },
    'tier': { type: 'string', default: 'growth' },
    'status': { type: 'string', default: 'active' },
  },
  strict: true,
});

const tenantCode = values['tenant-code'];
const company = values['company'];
const schemaName = values['schema-name'] || tenantCode?.toLowerCase();
const tier = values['tier'];
const status = values['status'];

if (!tenantCode || !company || !schemaName) {
  console.error('Usage: provisionTenantCli.js --tenant-code CODE --company "Name" [--schema-name name]');
  process.exit(1);
}

async function main() {
  const { DB } = await import('pg-schemata');
  const { default: repositories } = await import('../../apps/nap-serv/src/db/repositories.js');
  const { default: logger } = await import('../../apps/nap-serv/src/lib/logger.js');
  const { getDatabaseUrl } = await import('../../apps/nap-serv/src/lib/envValidator.js');

  const DATABASE_URL = getDatabaseUrl();
  logger.info(`Provisioning tenant "${tenantCode}" on ${process.env.NODE_ENV || 'development'} database...`);

  if (!DB.db) {
    DB.init(DATABASE_URL, repositories, logger);
  }

  const db = DB.db;
  const upperCode = tenantCode.toUpperCase();
  const normalizedSchema = schemaName.toLowerCase();

  // 1. Insert tenant record (if not exists)
  const existing = await db.oneOrNone(
    'SELECT id FROM admin.tenants WHERE tenant_code = $1 AND deactivated_at IS NULL',
    [upperCode],
  );

  if (existing) {
    logger.info(`Tenant "${upperCode}" already exists (id: ${existing.id}), skipping insert.`);
  } else {
    const tenant = await db.one(
      `INSERT INTO admin.tenants
         (tenant_code, company, schema_name, status, tier, allowed_modules)
       VALUES ($1, $2, $3, $4, $5, '[]'::jsonb)
       RETURNING id`,
      [upperCode, company, normalizedSchema, status, tier],
    );
    logger.info(`Inserted tenant "${upperCode}" (id: ${tenant.id}).`);
  }

  // 2. Provision schema (drops existing, creates fresh tables + seeds)
  const { provisionTenant } = await import('../../apps/nap-serv/src/services/tenantProvisioning.js');
  await provisionTenant({ schemaName: normalizedSchema, tenantCode: upperCode });

  logger.info(`Tenant "${upperCode}" fully provisioned.`);
  await db.$pool.end();
}

main().catch((err) => {
  console.error('Tenant provisioning failed:', err);
  process.exit(1);
});
