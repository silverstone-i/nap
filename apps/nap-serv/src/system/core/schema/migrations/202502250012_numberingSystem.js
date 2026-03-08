/**
 * @file Migration: create tenant numbering tables in tenant schemas
 * @module core/schema/migrations/202502250012_numberingSystem
 *
 * Creates: tenant_numbering_config, tenant_number_sequence_state
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';
import { dropTables, getModelKey, isTableModel, orderModels } from '../../../../db/migrations/modelPlanner.js';

const NUMBERING_TABLES = new Set(['tenant_numbering_config', 'tenant_number_sequence_state']);

export default defineMigration({
  id: '202502250012-numbering-system',
  description: 'Create tenant numbering config and sequence state tables',

  async up({ schema, models }) {
    if (schema === 'admin') return;

    const numberingModels = Object.values(models).filter(
      (m) => isTableModel(m) && NUMBERING_TABLES.has(m.schema?.table),
    );
    if (!numberingModels.length) return;

    const ordered = orderModels(
      Object.fromEntries(numberingModels.map((model) => [getModelKey(model), model])),
    );

    for (const model of ordered) {
      await model.createTable();
    }
  },

  async down({ schema, models }) {
    if (schema === 'admin') return;

    const numberingModels = Object.values(models).filter(
      (m) => isTableModel(m) && NUMBERING_TABLES.has(m.schema?.table),
    );
    if (!numberingModels.length) return;

    await dropTables(numberingModels);
  },
});
