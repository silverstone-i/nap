'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { defineMigration } from '../../../../src/db/migrations/defineMigration.js';
import { dropTables, getModelKey, isTableModel, orderModels } from '../../../../src/db/migrations/modelPlanner.js';

export default defineMigration({
  id: '202502110001-bootstrap-admin',
  description: 'Create core admin tables for tenant management',
  async up({ schema, models, ensureExtensions }) {
    if (schema !== 'admin') return;

    await ensureExtensions(['pgcrypto', 'uuid-ossp']);

    const adminModels = Object.values(models)
      .filter(isTableModel)
      .filter(model => model.schema?.dbSchema === 'admin');

    const ordered = orderModels(
      Object.fromEntries(adminModels.map(model => [getModelKey(model), model])),
    );

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
      .filter(model => model.schema?.dbSchema === 'admin');

    await dropTables(adminModels);
  },
});
