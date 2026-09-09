/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import { fieldGrantSchema, scopeKinds } from '@nap/shared';
import { HttpError } from '../util/httpError.js';
import { accessCatalog, businessPermissions } from './accessCatalog.js';
import type { CellRepositories } from '../db/cell/repositories.js';
import type { CellTransaction } from '../db/withTenantTransaction.js';
import type { ResolvedSession } from '../util/resolvedSession.js';
/** Does: Describes a resource row evaluated by authorization. Used by: policy callbacks. */
type Row = Record<string, unknown>;
import type { FiltersInput } from 'pg-schemata';
/** Does: Describes one resolved grant with its original scope. Used by: policy evaluation. */
export type ScopedGrant = {
  id: string;
  roleId: string;
  scope: (typeof scopeKinds)[number];
  companies: string[];
  projects: string[];
  capabilities: string[];
  fields: z.infer<typeof fieldGrantSchema>[];
};
/** Does: Holds record and field decisions for one operation. Used by: framework queries and writes. */
export type ResourcePolicy = {
  beforeCreate?: (row: Row) => Promise<void>;
  filters: FiltersInput;
  check: (row: Row, creation?: boolean) => void;
  write: (row: Row, target: Row) => void;
  redact: (row: Row) => Row;
  query: (columns: string[]) => void;
};
/** Does: Loads active assignments without flattening their scopes. Called by: request authorization inside the tenant transaction. */
export async function loadGrants(
  tx: CellTransaction<CellRepositories>,
  session: ResolvedSession
) {
  if (!session.tenantId) throw new HttpError('FORBIDDEN');
  await tx.roles.lockTenant(session.tenantId, true);
  const binding = await tx.tenant_user_bindings.findOneBy({
    portal_user_id: session.actorId,
    status: 'active',
  });
  const assignments = binding
    ? await tx.role_assignments.findWhere({ binding_id: binding.id })
    : [];
  const assignmentIds = assignments.map(a => a.id);
  const roleIds = [...new Set(assignments.map(a => a.role_id))];
  const roles = roleIds.length
    ? await tx.roles.findWhere({ id: { $in: roleIds } })
    : [];
  const companies = assignmentIds.length
    ? await tx.assignment_companies.findWhere({
        assignment_id: { $in: assignmentIds },
      })
    : [];
  const projects = assignmentIds.length
    ? await tx.assignment_projects.findWhere({
        assignment_id: { $in: assignmentIds },
      })
    : [];
  const grants: ScopedGrant[] = [];
  let admin =
    session.platformAdmin === true &&
    session.view?.controlledAccess?.mode === 'access';
  for (const assignment of assignments) {
    const role = roles.find(r => r.id === assignment.role_id);
    if (!role) continue;
    if (role.code === 'tenant_admin' && assignment.scope === 'tenant')
      admin = true;
    grants.push({
      id: assignment.id,
      roleId: role.id,
      scope: z.enum(scopeKinds).parse(assignment.scope),
      companies: companies
        .filter(c => c.assignment_id === assignment.id)
        .map(c => c.company_id),
      projects: projects
        .filter(p => p.assignment_id === assignment.id)
        .map(p => p.project_id),
      capabilities: z.array(z.string()).parse(role.capabilities),
      fields: z.array(fieldGrantSchema).parse(role.fields),
    });
  }
  return { admin, grants };
}
/** Does: Builds scoped record/field decisions from resolved assignments. Called by: resource authorization and policy tests. */
export function buildPolicy(
  resource: string,
  action: string,
  state: { admin: boolean; grants: ScopedGrant[] },
  selfId: string | undefined,
  companyProjects: Row[] = [],
  fields: { name: string; columns: string[] }[] = []
): ResourcePolicy {
  const permission = `${resource}::${action}`;
  const matching = state.grants.filter(g =>
    g.capabilities.includes(permission)
  );
  if (!state.admin && !matching.length) throw new HttpError('FORBIDDEN');
  const projectResource = resource.startsWith('projects::');
  /** Does: Tests whether one grant covers a target record. */
  function covers(g: ScopedGrant, row: Row, creation = false) {
    if (g.scope === 'tenant') return true;
    if (g.scope === 'self') return !creation && !!selfId && row.id === selfId;
    if (projectResource) {
      if (g.scope === 'all_projects') return true;
      if (g.scope === 'company_projects')
        return g.companies.includes(String(row.company_id));
      return (
        !creation &&
        g.scope === 'projects' &&
        g.projects.includes(String(row.id))
      );
    }
    return (
      g.scope === 'all_companies' ||
      (!creation &&
        g.scope === 'companies' &&
        g.companies.includes(String(row.id)))
    );
  }
  const unrestricted =
    state.admin ||
    matching.some(
      g =>
        g.scope === 'tenant' ||
        g.scope === (projectResource ? 'all_projects' : 'all_companies')
    );
  const ids = new Set<string>();
  for (const g of matching) {
    if (g.scope === 'self' && selfId) ids.add(selfId);
    if (projectResource && g.scope === 'projects')
      g.projects.forEach(id => ids.add(id));
    if (!projectResource && g.scope === 'companies')
      g.companies.forEach(id => ids.add(id));
    if (projectResource && g.scope === 'company_projects')
      companyProjects
        .filter(p => g.companies.includes(String(p.company_id)))
        .forEach(p => ids.add(String(p.id)));
  }
  /** Does: Tests the field grants applicable to this exact record. */
  function fieldAllowed(group: string, mode: 'view' | 'edit', row: Row) {
    return (
      state.admin ||
      state.grants.some(
        g =>
          covers(g, row) &&
          g.fields.some(
            f => f.resource === resource && f.group === group && f[mode]
          )
      )
    );
  }
  return {
    filters: unrestricted ? {} : { id: { $in: [...ids] } },
    check(row, creation = false) {
      if (!state.admin && !matching.some(g => covers(g, row, creation)))
        throw new HttpError(creation ? 'FORBIDDEN' : 'NOT_FOUND');
    },
    write(row, target) {
      for (const group of fields)
        if (
          group.columns.some(c => Object.hasOwn(row, c)) &&
          !fieldAllowed(group.name, 'edit', target)
        )
          throw new HttpError('FORBIDDEN');
    },
    redact(row) {
      const result = { ...row };
      for (const group of fields)
        if (!fieldAllowed(group.name, 'view', row))
          for (const c of group.columns) delete result[c];
      return result;
    },
    query(columns) {
      for (const group of fields)
        if (group.columns.some(c => columns.includes(c)) && !state.admin)
          throw new HttpError('FORBIDDEN');
    },
  };
}
/** Does: Builds the current business-resource policy. Called by: factory resource hooks inside the operation transaction. */
export async function resourcePolicy(
  tx: CellTransaction<CellRepositories>,
  session: ResolvedSession,
  resource: string,
  action: string
) {
  const catalog = accessCatalog.find(r => r.resource === resource);
  if (!catalog?.capabilities.includes(`${resource}::${action}`))
    throw new HttpError('FORBIDDEN');
  const state = await loadGrants(tx, session);
  const projects = resource.startsWith('projects::')
    ? await tx.projects.findWhere({}, 'AND', { includeDeactivated: true })
    : [];
  const policy = buildPolicy(
    resource,
    action,
    state,
    session.entityId,
    projects,
    catalog.fields
  );
  const check = policy.check;
  return {
    ...policy,
    async beforeCreate(row: Row) {
      if (
        resource.startsWith('projects::') &&
        typeof row.company_id === 'string'
      ) {
        const parent = await tx.companies.findById(String(row.company_id));
        if (!parent) throw new HttpError('INVALID_INPUT');
      }
    },
    check,
  };
}
/** Does: Loads candidate business capabilities for route gates. Called by: session enrichment before routing. */
export async function tenantCapabilities(
  tx: CellTransaction<CellRepositories>,
  session: ResolvedSession
) {
  const state = await loadGrants(tx, session);
  return new Set(
    state.admin
      ? businessPermissions
      : [
          'core::identity::profile',
          ...state.grants.flatMap(g => g.capabilities),
        ]
  );
}

/** Does: Lists minimal active company references within project-create authority. Called by: the Projects reference selector. */
export async function projectCompanyOptions(
  tx: CellTransaction<CellRepositories>,
  session: ResolvedSession
) {
  const state = await loadGrants(tx, session);
  const grants = state.grants.filter(g =>
    g.capabilities.includes('projects::projects::create')
  );
  const all =
    state.admin ||
    grants.some(g => g.scope === 'tenant' || g.scope === 'all_projects');
  const ids = grants
    .filter(g => g.scope === 'company_projects')
    .flatMap(g => g.companies);
  if (!all && !ids.length) return [];
  const rows = await tx.companies.findWhere(all ? {} : { id: { $in: ids } });
  return rows.map(({ id, code, name }) => ({ id, code, name }));
}
