/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import { accessChangeSchema, fieldGrantSchema } from '@nap/shared';
import { accessCatalog } from './accessCatalog.js';
import { loadGrants } from './authorization.js';
import { HttpError } from '../util/httpError.js';
import type { CellRepositories } from '../db/cell/repositories.js';
import type { CellTransaction } from '../db/withTenantTransaction.js';
import type { ResolvedSession } from '../util/resolvedSession.js';
/** Does: Checks tenant-wide access administration. Called by: access endpoints inside their transaction. */
export async function requireAccessAdmin(
  tx: CellTransaction<CellRepositories>,
  session: ResolvedSession
) {
  // Acquire the writer lock before reading grants to serialize last-admin checks.
  await tx.roles.lockTenant(session.tenantId!);
  if (!(await loadGrants(tx, session)).admin) throw new HttpError('FORBIDDEN');
}
/** Does: Reads the active role, assignment and scope catalog. Called by: access overview and explanations. */
export async function accessOverview(
  tx: CellTransaction<CellRepositories>,
  session: ResolvedSession
) {
  await requireAccessAdmin(tx, session);
  const roles = await tx.roles.findWhere({});
  const assignments = await tx.role_assignments.findWhere({});
  const companies = await tx.assignment_companies.findWhere({});
  const projects = await tx.assignment_projects.findWhere({});
  const users = await tx.tenant_user_bindings.findWhere({ status: 'active' });
  const people = [
    ...(await tx.employees.findWhere({})),
    ...(await tx.clients.findWhere({})),
    ...(await tx.vendor_contacts.findWhere({})),
  ];
  return {
    roles,
    assignments: assignments.map(a => ({
      ...a,
      targets: [
        ...companies
          .filter(c => c.assignment_id === a.id)
          .map(c => c.company_id),
        ...projects
          .filter(p => p.assignment_id === a.id)
          .map(p => p.project_id),
      ],
    })),
    users: users.map(u => ({
      ...u,
      name: people.find(p => p.id === u.entity_id)?.name ?? u.portal_user_id,
    })),
    companies: await tx.companies.findWhere({}),
    projects: await tx.projects.findWhere({}),
    catalog: accessCatalog,
  };
}
/** Does: Checks that a change leaves an active tenant administrator. Called by: assignment and membership revocation. */
export async function protectTenantAdmin(
  tx: CellTransaction<CellRepositories>,
  bindingId?: string,
  assignmentId?: string
) {
  const role = await tx.roles.findOneBy({ code: 'tenant_admin' });
  if (!role) return;
  const assignments = await tx.role_assignments.findWhere({
    role_id: role.id,
    scope: 'tenant',
  });
  if (
    !assignments.some(a => a.binding_id === bindingId || a.id === assignmentId)
  )
    return;
  const bindings = await tx.tenant_user_bindings.findWhere({
    status: 'active',
  });
  if (
    !assignments.some(
      a =>
        a.binding_id !== bindingId &&
        a.id !== assignmentId &&
        bindings.some(b => b.id === a.binding_id)
    )
  )
    throw new HttpError('CONFLICT');
}
/** Does: Applies an audited role or assignment change. Called by: the access mutation route. */
export async function changeAccess(
  tx: CellTransaction<CellRepositories>,
  session: ResolvedSession,
  body: z.infer<typeof accessChangeSchema>
) {
  await requireAccessAdmin(tx, session);
  const tenant_id = session.tenantId!;
  let id: string;
  if (body.operation === 'role') {
    const allowed = accessCatalog.flatMap(r => r.capabilities);
    if (
      body.capabilities.some(p => !allowed.includes(p)) ||
      new Set(body.capabilities).size !== body.capabilities.length
    )
      throw new HttpError('INVALID_INPUT');
    for (const field of body.fields) {
      const resource = accessCatalog.find(r => r.resource === field.resource);
      const groups: readonly { name: string; columns: string[] }[] =
        resource?.fields ?? [];
      if (!groups.some(g => g.name === field.group))
        throw new HttpError('INVALID_INPUT');
    }
    const existing = body.id ? await tx.roles.findById(body.id) : null;
    if (body.id && !existing) throw new HttpError('NOT_FOUND');
    if (
      existing?.permanent ||
      ['tenant_admin', 'platform_admin', 'support'].includes(body.code)
    )
      throw new HttpError('FORBIDDEN');
    if (existing && body.code !== existing.code)
      throw new HttpError('INVALID_INPUT');
    if (existing) {
      id = existing.id;
      await tx.roles.update(id, {
        name: body.name,
        capabilities: JSON.stringify(body.capabilities),
        fields: JSON.stringify(body.fields),
      });
    } else
      id = (
        await tx.roles.insert({
          tenant_id,
          code: body.code,
          name: body.name,
          capabilities: JSON.stringify(body.capabilities),
          fields: JSON.stringify(body.fields),
          permanent: false,
        })
      ).id;
  } else if (body.operation === 'archive-role') {
    const role = await tx.roles.findById(body.id);
    if (!role) throw new HttpError('NOT_FOUND');
    if (role.permanent) throw new HttpError('FORBIDDEN');
    id = role.id;
    await tx.roles.removeWhere({ id });
  } else if (body.operation === 'assign') {
    const role = await tx.roles.findById(body.roleId);
    const binding = await tx.tenant_user_bindings.findById(body.bindingId);
    if (!role || !binding || binding.status !== 'active')
      throw new HttpError('INVALID_INPUT');
    if (role.code === 'tenant_admin' && body.scope !== 'tenant')
      throw new HttpError('INVALID_INPUT');
    const selected = ['companies', 'company_projects', 'projects'].includes(
      body.scope
    );
    if (
      (selected && body.targets.length === 0) ||
      (!selected && body.targets.length !== 0) ||
      new Set(body.targets).size !== body.targets.length
    )
      throw new HttpError('INVALID_INPUT');
    for (const target of body.targets) {
      const row =
        body.scope === 'projects'
          ? await tx.projects.findById(target)
          : await tx.companies.findById(target);
      if (!row) throw new HttpError('INVALID_INPUT');
    }
    id = (
      await tx.role_assignments.insert({
        tenant_id,
        role_id: role.id,
        binding_id: binding.id,
        scope: body.scope,
      })
    ).id;
    for (const target of body.targets) {
      if (body.scope === 'projects')
        await tx.assignment_projects.insert({
          tenant_id,
          assignment_id: id,
          project_id: target,
        });
      else
        await tx.assignment_companies.insert({
          tenant_id,
          assignment_id: id,
          company_id: target,
        });
    }
  } else {
    const assignment = await tx.role_assignments.findById(body.id);
    if (!assignment) throw new HttpError('NOT_FOUND');
    await protectTenantAdmin(tx, undefined, assignment.id);
    id = assignment.id;
    await tx.role_assignments.removeWhere({ id });
  }
  await tx.access_events.insert({
    tenant_id,
    operator_id: session.operatorId ?? session.actorId,
    event: body.operation,
    detail: { ...body, id },
  });
  return { id };
}
/** Does: Explains all active assignments for one tenant user. Called by: the effective-access endpoint. */
export async function effectiveAccess(
  tx: CellTransaction<CellRepositories>,
  session: ResolvedSession,
  binding: string
) {
  const overview = await accessOverview(tx, session);
  if (!overview.users.some(u => u.id === binding))
    throw new HttpError('NOT_FOUND');
  return overview.assignments
    .filter(
      a =>
        a.binding_id === binding && overview.roles.some(r => r.id === a.role_id)
    )
    .map(a => {
      const role = overview.roles.find(r => r.id === a.role_id)!;
      return {
        ...a,
        role: {
          ...role,
          capabilities: z.array(z.string()).parse(role.capabilities),
          fields: z.array(fieldGrantSchema).parse(role.fields),
        },
      };
    });
}
