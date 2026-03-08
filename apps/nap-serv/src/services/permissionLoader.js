/**
 * @file RBAC permission loader — resolves effective permissions for a user in a tenant schema
 * @module nap-serv/services/permissionLoader
 *
 * Loads the full 4-layer permission canon:
 *   Layer 1 — caps (module::router::action → level)
 *   Layer 2 — scope (all_projects | assigned_companies | assigned_projects | self) + projectIds + companyIds
 *   Layer 3 — stateFilters (module::router → visible status values)
 *   Layer 4 — fieldGroups (module::router → allowed column names)
 *
 * Roles are resolved from entity records via entity_type + entity_id.
 * Entity tables are created in Phase 5; until then the loader returns
 * empty permissions for users with entity_type = null.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import db from '../db/db.js';
import logger from '../lib/logger.js';

const LEVEL_ORDER = { none: 0, view: 1, full: 2 };
const LEVEL_NAMES = ['none', 'view', 'full'];

/** Scope hierarchy: higher value = broader access. Most permissive wins on merge. */
const SCOPE_ORDER = { self: 0, assigned_projects: 1, assigned_companies: 2, all_projects: 3 };

/** Maps entity_type to the table name in the tenant schema. */
const ENTITY_TABLE_MAP = {
  employee: 'employees',
  vendor: 'vendors',
  client: 'clients',
  contact: 'contacts',
};

/** Empty permission canon. */
const EMPTY_CANON = Object.freeze({
  caps: {},
  scope: 'all_projects',
  projectIds: null,
  companyIds: null,
  entityType: null,
  entityId: null,
  stateFilters: {},
  fieldGroups: {},
});

/**
 * Look up the entity record and read its roles text[] array.
 *
 * @param {string} schemaName Tenant schema
 * @param {string|null} entityType e.g. 'employee', 'vendor'
 * @param {string|null} entityId UUID of the entity
 * @returns {Promise<string[]>} Role codes array, empty if entity not found
 */
async function resolveEntityRoles(schemaName, entityType, entityId) {
  if (!entityType || !entityId) return [];

  const tableName = ENTITY_TABLE_MAP[entityType];
  if (!tableName) return [];

  try {
    const modelInstance = db(tableName, schemaName);
    if (!modelInstance) return [];

    const entity = await modelInstance.findById(entityId);
    if (!entity) return [];

    return Array.isArray(entity.roles) ? entity.roles : [];
  } catch {
    // Entity table may not exist yet (Phase 5) — return empty
    return [];
  }
}

/**
 * Load the full RBAC canon for a user in a tenant.
 *
 * @param {object} options
 * @param {string} options.schemaName Tenant schema name
 * @param {string} options.userId User UUID
 * @param {string|null} [options.entityType] From nap_users.entity_type
 * @param {string|null} [options.entityId] From nap_users.entity_id
 * @returns {Promise<object>} Permission canon
 */
export async function loadPermissions({ schemaName, userId, entityType = null, entityId = null }) {
  if (!schemaName || !userId) return { ...EMPTY_CANON };

  // ── Resolve entity roles ──────────────────────────────────────────────
  const roleCodes = await resolveEntityRoles(schemaName, entityType, entityId);
  if (!roleCodes.length) {
    return { ...EMPTY_CANON, entityType, entityId };
  }

  // ── Look up role records by code ──────────────────────────────────────
  let roles;
  try {
    roles = await db('roles', schemaName).findWhere(
      [{ code: { $in: roleCodes } }],
      'AND',
      { columnWhitelist: ['id', 'code', 'scope'] },
    );
  } catch (err) {
    logger.warn('permissionLoader: failed to load roles', { error: err?.message, schemaName });
    return { ...EMPTY_CANON, entityType, entityId };
  }

  if (!roles?.length) {
    return { ...EMPTY_CANON, entityType, entityId };
  }

  const roleIds = roles.map((r) => r.id);

  // ── Layer 1: Policies (capabilities map) ──────────────────────────────
  const policies = await db('policies', schemaName).findWhere(
    [{ role_id: { $in: roleIds } }],
    'AND',
    { columnWhitelist: ['module', 'router', 'action', 'level'] },
  );

  const caps = {};
  for (const p of policies) {
    const key = `${p.module ?? ''}::${p.router ?? ''}::${p.action ?? ''}`;
    const current = caps[key];
    if (!current) {
      caps[key] = p.level;
      continue;
    }
    // Multi-role merge: most permissive level wins
    const have = LEVEL_ORDER[current] ?? 0;
    const next = LEVEL_ORDER[p.level] ?? 0;
    caps[key] = LEVEL_NAMES[Math.max(have, next)];
  }

  // ── Layer 2: Data scope ───────────────────────────────────────────────
  let winningScope = 'self';
  for (const r of roles) {
    if ((SCOPE_ORDER[r.scope] ?? 0) > (SCOPE_ORDER[winningScope] ?? 0)) {
      winningScope = r.scope;
    }
  }

  let projectIds = null;
  let companyIds = null;

  if (winningScope === 'assigned_companies') {
    try {
      const companyMemberships = await db('companyMembers', schemaName).findWhere(
        [{ user_id: userId }],
        'AND',
        { columnWhitelist: ['company_id'] },
      );
      companyIds = companyMemberships.map((m) => m.company_id);

      // Resolve project IDs belonging to those companies
      if (companyIds.length) {
        const companyProjects = await db('projects', schemaName).findWhere(
          [{ company_id: { $in: companyIds } }],
          'AND',
          { columnWhitelist: ['id'] },
        );
        projectIds = companyProjects.map((p) => p.id);
      } else {
        projectIds = [];
      }
    } catch {
      // projects table may not exist yet
      projectIds = [];
      companyIds = [];
    }
  } else if (winningScope === 'assigned_projects') {
    try {
      const memberships = await db('projectMembers', schemaName).findWhere(
        [{ user_id: userId }],
        'AND',
        { columnWhitelist: ['project_id'] },
      );
      projectIds = memberships.map((m) => m.project_id);
    } catch {
      projectIds = [];
    }
  }
  // winningScope === 'all_projects' or 'self' → both stay null

  // ── Layer 3: State filters ────────────────────────────────────────────
  const stateRows = await db('stateFilters', schemaName).findWhere(
    [{ role_id: { $in: roleIds } }],
    'AND',
    { columnWhitelist: ['module', 'router', 'visible_statuses'] },
  );

  const stateFilters = {};
  for (const sf of stateRows) {
    const key = `${sf.module ?? ''}::${sf.router ?? ''}`;
    const existing = stateFilters[key];
    if (!existing) {
      stateFilters[key] = [...sf.visible_statuses];
    } else {
      // Union: add any statuses not already present
      for (const status of sf.visible_statuses) {
        if (!existing.includes(status)) existing.push(status);
      }
    }
  }

  // ── Layer 4: Field groups ─────────────────────────────────────────────
  const grants = await db('fieldGroupGrants', schemaName).findWhere(
    [{ role_id: { $in: roleIds } }],
    'AND',
    { columnWhitelist: ['field_group_id'] },
  );

  const fieldGroups = {};
  const grantedIds = grants.map((g) => g.field_group_id);

  if (grantedIds.length) {
    const grantedDefs = await db('fieldGroupDefinitions', schemaName).findWhere(
      [{ id: { $in: grantedIds } }],
      'AND',
      { columnWhitelist: ['module', 'router', 'columns'] },
    );
    for (const def of grantedDefs) {
      const key = `${def.module ?? ''}::${def.router ?? ''}`;
      const existing = fieldGroups[key];
      if (!existing) {
        fieldGroups[key] = [...def.columns];
      } else {
        for (const col of def.columns) {
          if (!existing.includes(col)) existing.push(col);
        }
      }
    }
  }

  // Include is_default groups for resources that have explicit grants active
  if (Object.keys(fieldGroups).length) {
    const defaultDefs = await db('fieldGroupDefinitions', schemaName).findWhere(
      [{ is_default: true }],
      'AND',
      { columnWhitelist: ['module', 'router', 'columns'] },
    );
    for (const def of defaultDefs) {
      const key = `${def.module ?? ''}::${def.router ?? ''}`;
      const existing = fieldGroups[key];
      if (!existing) continue; // Only add defaults for resources with explicit grants
      for (const col of def.columns) {
        if (!existing.includes(col)) existing.push(col);
      }
    }
  }

  return {
    caps,
    scope: winningScope,
    projectIds,
    companyIds,
    entityType,
    entityId,
    stateFilters,
    fieldGroups,
  };
}

export default { loadPermissions };
