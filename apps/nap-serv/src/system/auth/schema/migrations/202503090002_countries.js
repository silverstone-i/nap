/**
 * @file Migration: create countries reference table in admin schema
 * @module auth/schema/migrations/202503090002_countries
 *
 * Seed data is handled by countriesSeeder (called from setupAdmin).
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';
import { isTableModel, getModelKey, orderModels } from '../../../../db/migrations/modelPlanner.js';

export default defineMigration({
  id: '202503090002-countries',
  description: 'Create countries reference table in admin schema',

  async up({ schema, models }) {
    if (schema !== 'admin') return;

    // Create the countries table
    const countryModels = Object.values(models)
      .filter(isTableModel)
      .filter((m) => m.schema?.table === 'countries' && m.schema?.dbSchema === 'admin');

    if (!countryModels.length) return;

    const ordered = orderModels(
      Object.fromEntries(countryModels.map((model) => [getModelKey(model), model])),
    );

    for (const model of ordered) {
      await model.createTable();
    }
  },

  async down({ schema, db }) {
    if (schema !== 'admin') return;
    await db.none('DROP TABLE IF EXISTS admin.countries CASCADE');
  },
});
