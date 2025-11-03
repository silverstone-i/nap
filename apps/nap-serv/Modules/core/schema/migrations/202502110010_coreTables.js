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
  id: '202502110010-core-tables',
  description: 'Create core tenant tables',
  async up({ schema, models, ensureExtensions }) {
    if (schema === 'admin') return;

    await ensureExtensions(['pgcrypto', 'uuid-ossp']);

    const tenantModels = Object.values(models).filter(isTableModel);
    if (!tenantModels.length) return;

    const ordered = orderModels(
      Object.fromEntries(tenantModels.map(model => [getModelKey(model), model])),
    );

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
