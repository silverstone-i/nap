/**
 * @file Migration: seed import/export action entries into policy_catalog
 * @module core/schema/migrations/202603150013_importExportCatalog
 *
 * Data-only migration — adds per-router import and export action entries
 * to the policy_catalog table for granular RBAC control. Uses the
 * idempotent seedPolicyCatalog service so re-runs are safe.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';
import { seedPolicyCatalog } from '../../services/policyCatalogSeeder.js';

export default defineMigration({
  id: '202603150013-import-export-catalog',
  description: 'Add import/export action entries to policy_catalog',

  async up({ schema, db, pgp }) {
    if (schema === 'admin') return;

    const tenant = await db.oneOrNone('SELECT tenant_code FROM admin.tenants WHERE schema_name = $1', [schema]);
    const isNapsoft = tenant?.tenant_code === process.env.ROOT_TENANT_CODE;

    await seedPolicyCatalog(db, pgp, schema, isNapsoft);
  },
});
