/**
 * @file Migration: create core entity tables in tenant schemas
 * @module core/schema/migrations/202502110011_coreEntities
 *
 * Creates: sources, vendors, clients, employees, contacts, addresses, phone_numbers, inter_companies
 *
 * These tables are FK-ordered via orderModels (sources first, then entities
 * that reference it, then contacts/addresses that reference sources).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';
import { dropTables, getModelKey, isTableModel, orderModels } from '../../../../db/migrations/modelPlanner.js';

/** Entity table names added in Phase 5 (excludes RBAC tables from Phase 3) */
const ENTITY_TABLES = new Set([
  'sources',
  'vendors',
  'clients',
  'employees',
  'contacts',
  'addresses',
  'phone_numbers',
  'inter_companies',
]);

export default defineMigration({
  id: '202502110011-core-entities',
  description: 'Create core entity tables in tenant schemas',

  async up({ schema, models }) {
    if (schema === 'admin') return;

    const entityModels = Object.values(models).filter(
      (m) => isTableModel(m) && ENTITY_TABLES.has(m.schema?.table),
    );
    if (!entityModels.length) return;

    const ordered = orderModels(
      Object.fromEntries(entityModels.map((model) => [getModelKey(model), model])),
    );

    for (const model of ordered) {
      await model.createTable();
    }
  },

  async down({ schema, models }) {
    if (schema === 'admin') return;

    const entityModels = Object.values(models).filter(
      (m) => isTableModel(m) && ENTITY_TABLES.has(m.schema?.table),
    );
    if (!entityModels.length) return;

    await dropTables(entityModels);
  },
});
