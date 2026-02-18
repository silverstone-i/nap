/**
 * @file RBAC policy loader — resolves effective permissions for a user in a tenant schema
 * @module nap-serv/utils/RbacPolicies
 *
 * Loads the full 4-layer permission canon:
 *   Layer 1 — caps (module::router::action → level)
 *   Layer 2 — scope (all_projects | assigned_companies | assigned_projects) + projectIds + companyIds
 *   Layer 3 — stateFilters (module::router → visible status values)
 *   Layer 4 — fieldGroups (module::router → allowed column names)
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../db/db.js';

const LEVEL_ORDER = { none: 0, view: 1, full: 2 };
const LEVEL_NAMES = ['none', 'view', 'full'];

/** Scope hierarchy: higher value = broader access. Most permissive wins on merge. */
const SCOPE_ORDER = { assigned_projects: 0, assigned_companies: 1, all_projects: 2 };

/**
 * Load the full RBAC canon for a user in a tenant.
 *
 * @param {object} options
 * @param {string} options.schemaName Tenant schema name
 * @param {string} options.userId User UUID
 * @returns {Promise<object>} Permission canon: { caps, scope, projectIds, companyIds, stateFilters, fieldGroups }
 */
export async function loadPoliciesForUserTenant({ schemaName, userId }) {
  const empty = { caps: {}, scope: 'all_projects', projectIds: null, companyIds: null, stateFilters: {}, fieldGroups: {} };
  if (!schemaName || !userId) return empty;

  // ── Role membership ───────────────────────────────────────────────────
  const tenantRoles = await db('roleMembers', schemaName).findWhere(
    [{ user_id: userId }],
    'AND',
    { columnWhitelist: ['role_id'] },
  );

  if (!tenantRoles?.length) return empty;

  const roleIds = tenantRoles.map((r) => r.role_id);

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
    const have = LEVEL_ORDER[current] ?? 0;
    const next = LEVEL_ORDER[p.level] ?? 0;
    caps[key] = LEVEL_NAMES[Math.max(have, next)];
  }

  // ── Layer 2: Data scope ───────────────────────────────────────────────
  // Three-tier hierarchy: all_projects > assigned_companies > assigned_projects
  // Most permissive scope wins when user has multiple roles
  const roles = await db('roles', schemaName).findWhere(
    [{ id: { $in: roleIds } }],
    'AND',
    { columnWhitelist: ['id', 'scope'] },
  );

  let winningScope = 'assigned_projects';
  for (const r of roles) {
    if ((SCOPE_ORDER[r.scope] ?? 0) > (SCOPE_ORDER[winningScope] ?? 0)) {
      winningScope = r.scope;
    }
  }

  let projectIds = null;
  let companyIds = null;

  if (winningScope === 'assigned_companies') {
    // Load user's company memberships
    const companyMemberships = await db('companyMembers', schemaName).findWhere(
      [{ user_id: userId }],
      'AND',
      { columnWhitelist: ['company_id'] },
    );
    companyIds = companyMemberships.map((m) => m.company_id);

    // Resolve project IDs belonging to those companies so downstream
    // resources with project_id (not company_id) can still be filtered
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
  } else if (winningScope === 'assigned_projects') {
    const memberships = await db('projectMembers', schemaName).findWhere(
      [{ user_id: userId }],
      'AND',
      { columnWhitelist: ['project_id'] },
    );
    projectIds = memberships.map((m) => m.project_id);
  }
  // winningScope === 'all_projects' → both stay null

  // ── Layer 3: State filters ────────────────────────────────────────────
  // Union of visible_statuses across roles for each module::router
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
  // Union of columns across all granted groups + default groups per resource
  const grants = await db('fieldGroupGrants', schemaName).findWhere(
    [{ role_id: { $in: roleIds } }],
    'AND',
    { columnWhitelist: ['field_group_id'] },
  );

  const fieldGroups = {};
  const grantedIds = grants.map((g) => g.field_group_id);

  if (grantedIds.length) {
    // Fetch granted definitions
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

  // Also include is_default groups for any resource that has explicit grants
  // (so default columns are always visible when field groups are active)
  if (Object.keys(fieldGroups).length) {
    const defaultDefs = await db('fieldGroupDefinitions', schemaName).findWhere(
      [{ is_default: true }],
      'AND',
      { columnWhitelist: ['module', 'router', 'columns'] },
    );
    for (const def of defaultDefs) {
      const key = `${def.module ?? ''}::${def.router ?? ''}`;
      const existing = fieldGroups[key];
      if (!existing) {
        // Only add defaults for resources that have explicit grants active
        continue;
      }
      for (const col of def.columns) {
        if (!existing.includes(col)) existing.push(col);
      }
    }
  }

  return { caps, scope: winningScope, projectIds, companyIds, stateFilters, fieldGroups };
}

export default { loadPoliciesForUserTenant };
