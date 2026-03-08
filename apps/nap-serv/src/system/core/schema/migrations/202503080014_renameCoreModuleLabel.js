/**
 * @file Rename "Core Module" label to "Admin Module" in policy_catalog
 * @module core/schema/migrations/202503080014_renameCoreModuleLabel
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

export default defineMigration({
  id: '202503080014-rename-core-module-label',
  description: 'Rename policy_catalog "Core Module" label to "Admin Module" for UI consistency',
  async up({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(
      `UPDATE ${s}.policy_catalog SET label = 'Admin Module' WHERE module = 'core' AND router IS NULL AND action IS NULL`,
    );
  },
  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(
      `UPDATE ${s}.policy_catalog SET label = 'Core Module' WHERE module = 'core' AND router IS NULL AND action IS NULL`,
    );
  },
});
