/**
 * @file Migration: create core tenant tables (RBAC: roles, role_members, policies)
 * @module core/schema/migrations/202502110010_coreTables
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';
import { dropTables, getModelKey, isTableModel, orderModels } from '../../../../db/migrations/modelPlanner.js';

export default defineMigration({
  id: '202502110010-core-tables',
  description: 'Create core tenant tables (RBAC)',
  async up({ schema, models, ensureExtensions }) {
    if (schema === 'admin') return;

    await ensureExtensions(['pgcrypto', 'uuid-ossp']);

    const tenantModels = Object.values(models).filter(isTableModel);
    if (!tenantModels.length) return;

    const ordered = orderModels(Object.fromEntries(tenantModels.map((model) => [getModelKey(model), model])));

    for (const model of ordered) {
      await model.createTable();
    }
  },
  async down({ schema, models }) {
    if (schema === 'admin') return;

    const tenantModels = Object.values(models).filter(isTableModel);
    if (!tenantModels.length) return;

    await dropTables(tenantModels);
  },
});
