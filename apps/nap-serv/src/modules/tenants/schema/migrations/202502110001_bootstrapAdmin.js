/**
 * @file Migration: bootstrap admin schema tables (tenants, nap_users, nap_user_addresses, match_review_logs)
 * @module tenants/schema/migrations/202502110001_bootstrapAdmin
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';
import { dropTables, getModelKey, isTableModel, orderModels } from '../../../../db/migrations/modelPlanner.js';

export default defineMigration({
  id: '202502110001-bootstrap-admin',
  description: 'Create core admin tables for tenant management',
  async up({ schema, models, ensureExtensions }) {
    if (schema !== 'admin') return;

    await ensureExtensions(['pgcrypto', 'uuid-ossp', 'vector']);

    const adminModels = Object.values(models)
      .filter(isTableModel)
      .filter((model) => model.schema?.dbSchema === 'admin');

    if (!adminModels.length) return;

    const ordered = orderModels(Object.fromEntries(adminModels.map((model) => [getModelKey(model), model])));

    for (const model of ordered) {
      if (model.schema?.dbSchema !== 'admin' && typeof model.setSchemaName === 'function') {
        model.setSchemaName('admin');
      }
      await model.createTable();
    }
  },
  async down({ schema, models }) {
    if (schema !== 'admin') return;

    const adminModels = Object.values(models)
      .filter(isTableModel)
      .filter((model) => model.schema?.dbSchema === 'admin');

    await dropTables(adminModels);
  },
});
