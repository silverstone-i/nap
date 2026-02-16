/**
 * @file Migration: create core entity tables (sources, vendors, clients, employees,
 *       contacts, addresses, inter_companies)
 * @module core/schema/migrations/202502110011_coreEntityTables
 *
 * Tables are created in FK dependency order:
 *   sources → vendors, clients, employees → contacts, addresses → inter_companies
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

const CORE_ENTITY_MODELS = [
  'sources',
  'vendors',
  'clients',
  'employees',
  'contacts',
  'addresses',
  'interCompanies',
];

export default defineMigration({
  id: '202502110011-core-entity-tables',
  description: 'Create core entity tables (vendors, clients, employees, sources, contacts, addresses, inter_companies)',

  async up({ schema, models }) {
    if (schema === 'admin') return;

    // Create tables in FK dependency order
    for (const key of CORE_ENTITY_MODELS) {
      const model = models[key];
      if (model && typeof model.createTable === 'function') {
        await model.createTable();
      }
    }
  },

  async down({ schema, models }) {
    if (schema === 'admin') return;

    // Drop in reverse FK order
    const reversed = [...CORE_ENTITY_MODELS].reverse();
    for (const key of reversed) {
      const model = models[key];
      if (model && model.schemaName && model.tableName) {
        await model.db.none(`DROP TABLE IF EXISTS ${model.schemaName}.${model.tableName} CASCADE`);
      }
    }
  },
});
