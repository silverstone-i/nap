/**
 * @file Migration: create core RBAC tables in tenant schemas
 * @module core/schema/migrations/202502110010_coreRbac
 *
 * Creates: roles, policies, policy_catalog, state_filters,
 * field_group_definitions, field_group_grants, project_members, company_members
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';
import { dropTables, getModelKey, isTableModel, orderModels } from '../../../../db/migrations/modelPlanner.js';

const RBAC_TABLES = new Set([
  'roles',
  'policies',
  'policy_catalog',
  'state_filters',
  'field_group_definitions',
  'field_group_grants',
  'project_members',
  'company_members',
]);

export default defineMigration({
  id: '202502110010-core-rbac',
  description: 'Create core RBAC tables in tenant schemas',

  async up({ schema, models, ensureExtensions }) {
    if (schema === 'admin') return;

    await ensureExtensions(['pgcrypto', 'uuid-ossp']);

    const rbacModels = Object.values(models).filter(
      (m) => isTableModel(m) && RBAC_TABLES.has(m.schema?.table),
    );
    if (!rbacModels.length) return;

    const ordered = orderModels(
      Object.fromEntries(rbacModels.map((model) => [getModelKey(model), model])),
    );

    for (const model of ordered) {
      await model.createTable();
    }
  },

  async down({ schema, models }) {
    if (schema === 'admin') return;

    const rbacModels = Object.values(models).filter(
      (m) => isTableModel(m) && RBAC_TABLES.has(m.schema?.table),
    );
    if (!rbacModels.length) return;

    await dropTables(rbacModels);
  },
});
