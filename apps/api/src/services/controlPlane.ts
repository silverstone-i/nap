/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { seedTenantRoles, seedTenantAdmin } from './roleSeeds.js';
import { protectTenantAdmin } from './accessAdministration.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { controlBodySchema } from '@nap/shared';
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import { hashPassword } from '../util/password.js';
import { HttpError } from '../util/httpError.js';
import { audit, requirePlatform } from './platform.js';
import type { AdminRepositories } from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
import type { CellRegistry } from './cellRegistry.js';
import type { CellHandle } from '../db/cell/repositories.js';
import type { AuthConfiguration } from '../util/authConfig.js';

/** Does: Chooses the permission for a validated control command. Called by: the control router. */
export function commandPermission(body: z.infer<typeof controlBodySchema>) {
  if (body.operation === 'grant') return 'grants';
  if (body.operation === 'member' || body.operation === 'revoke')
    return 'members';
  if (['retry', 'activate', 'reconcile'].includes(body.operation))
    return 'provision';
  return 'registry';
}
/** Does: Reads a bounded central overview without password material. Called by: authorized operator overview. */
export async function controlOverview(tx: AdminTransaction<AdminRepositories>) {
  return {
    cells: (await tx.cells.findWhere({}))
      .slice(0, 200)
      .map(({ id, code, name, enabled }) => ({ id, code, name, enabled })),
    tenants: (await tx.tenants.findWhere({}))
      .slice(0, 200)
      .map(
        ({ id, tenant_code, company, tier, status, cell_id, provisioned }) => ({
          id,
          tenant_code,
          company,
          tier,
          status,
          cell_id,
          provisioned,
        })
      ),
    users: (await tx.portal_users.findWhere({}))
      .slice(0, 200)
      .map(({ id, email, status }) => ({ id, email, status })),
    members: (await tx.portal_user_tenants.findWhere({}))
      .slice(0, 200)
      .map(
        ({
          id,
          portal_user_id,
          tenant_id,
          status,
          user_type,
          ready,
          entity_id,
        }) => ({
          id,
          portal_user_id,
          tenant_id,
          status,
          user_type,
          ready,
          entity_id,
        })
      ),
    jobs: (await tx.provisioning_jobs.findWhere({}))
      .slice(0, 200)
      .map(
        ({
          id,
          tenant_id,
          stage,
          failure_code,
          membership_id,
          record_id,
          kind,
        }) => ({
          id,
          tenant_id,
          stage,
          failure_code,
          membership_id,
          record_id,
          kind,
        })
      ),
    grants: (await tx.platform_grants.findWhere({}))
      .slice(0, 200)
      .map(({ id, portal_user_id, role, permission }) => ({
        id,
        portal_user_id,
        role,
        permission,
      })),
  };
}
/** Does: Reads the target tenant and checks its registered cell is enabled. Called by: provisioning and activation. */
async function assigned(tx: AdminTransaction<AdminRepositories>, id: string) {
  const tenant = await tx.cells.assignment(id);
  if (!tenant || !tenant.cell_id || !tenant.enabled)
    throw new HttpError('FORBIDDEN');
  return tenant;
}
/** Does: Writes a tenant projection through its RLS transaction. Called by: activation and member synchronization. */
async function projectTenant(
  tx: AdminTransaction<AdminRepositories>,
  cell: CellHandle,
  id: string
) {
  const tenant = await tx.tenants.findById(id);
  if (!tenant) throw new HttpError('NOT_FOUND');
  await withTenantTransaction(cell, id, async local => {
    const row = await local.cell_tenants.findById(id);
    if (row && row.revision <= tenant.revision)
      await local.cell_tenants.update(id, {
        revision: tenant.revision,
        code: tenant.tenant_code,
        status: tenant.status,
      });
    else if (!row)
      await local.cell_tenants.insert({
        revision: tenant.revision,
        id,
        tenant_id: id,
        code: tenant.tenant_code,
        status: tenant.status,
      });
  });
}
/** Does: Replays one durable membership job and records a safe failure stage. Called by: provisioning and operator retry. */
async function runJob(
  tx: AdminTransaction<AdminRepositories>,
  cells: CellRegistry,
  jobId: string,
  name?: string
) {
  const job = await tx.provisioning_jobs.findById(jobId);
  if (!job) throw new HttpError('NOT_FOUND');
  const tenant = await assigned(tx, job.tenant_id);
  const member = await tx.portal_user_tenants.findById(job.membership_id);
  if (!member) throw new HttpError('NOT_FOUND');
  const user = await tx.portal_users.lockIdentity(member.portal_user_id);
  if (!user || user.is_root || user.status !== 'active')
    throw new HttpError('FORBIDDEN');
  const others = await tx.portal_user_tenants.findWhere({
    portal_user_id: user.id,
    status: 'active',
  });
  if (
    others.some(
      m =>
        m.id !== member.id &&
        (m.user_type !== 'vendor' || member.user_type !== 'vendor')
    )
  )
    throw new HttpError('CONFLICT');
  try {
    const cell = cells.get(tenant.cell_id);
    await projectTenant(tx, cell, job.tenant_id);
    await withTenantTransaction(cell, job.tenant_id, async local => {
      const repository =
        job.kind === 'employee'
          ? local.employees
          : job.kind === 'client'
            ? local.clients
            : local.vendor_contacts;
      const exists = await repository.findById(job.record_id);
      if (!exists) {
        if (!name) throw new HttpError('INVALID_INPUT');
        if (
          job.kind === 'vendor' &&
          job.vendor_id &&
          !(await local.vendors.findById(job.vendor_id))
        )
          await local.vendors.insert({
            id: job.vendor_id,
            tenant_id: job.tenant_id,
            code: job.vendor_id,
            name,
          });
        await repository.insert({
          id: job.record_id,
          tenant_id: job.tenant_id,
          code: job.record_id,
          name,
          email: user.email,
          is_app_user: member.status === 'active',
          ...(job.kind === 'vendor' ? { vendor_id: job.vendor_id! } : {}),
        });
      } else
        await repository.update(job.record_id, {
          is_app_user: member.status === 'active',
        });
      const projection = await local.tenant_user_bindings.findById(member.id);
      const data = {
        revision: member.revision,
        portal_user_id: user.id,
        entity_id: job.record_id,
        user_type: job.kind,
        status: member.status,
      };
      if (projection && projection.revision <= member.revision)
        await local.tenant_user_bindings.update(member.id, data);
      else if (!projection)
        await local.tenant_user_bindings.insert({
          id: member.id,
          tenant_id: job.tenant_id,
          ...data,
        });
    });
  } catch (error) {
    if (error instanceof HttpError && error.code === 'INVALID_INPUT')
      throw error;
    await tx.provisioning_jobs.update(job.id, {
      stage: 'failed',
      failure_code: 'CELL_SYNC_FAILED',
    });
    return;
  }
  await tx.portal_user_tenants.update(member.id, {
    ready: member.status === 'active',
  });
  await tx.provisioning_jobs.update(job.id, {
    stage: 'complete',
    failure_code: null,
  });
}
/** Does: Executes a permission-checked central command and its audit. Called by: the factory's admin transaction. */
export async function controlCommand(
  tx: AdminTransaction<AdminRepositories>,
  cells: CellRegistry,
  actor: string,
  body: z.infer<typeof controlBodySchema>,
  config: AuthConfiguration
) {
  await tx.cells.lockControl();
  await requirePlatform(tx, actor, commandPermission(body));
  // The event is committed only with successful central changes; cell retries are idempotent.
  await audit(
    tx,
    actor,
    body.operation,
    'target' in body ? body.target : null,
    'reason' in body ? body.reason : `Operator ${body.operation}`
  );
  switch (body.operation) {
    case 'cell': {
      const existing = await tx.cells.findOneBy({ code: body.code });
      if (existing)
        await tx.cells.update(existing.id, {
          name: body.name,
          enabled: body.enabled,
        });
      else
        await tx.cells.insert({
          code: body.code,
          name: body.name,
          enabled: body.enabled,
        });
      break;
    }
    case 'tenant': {
      const selected = await tx.cells.findById(body.cell);
      if (!selected || !selected.enabled) throw new HttpError('INVALID_INPUT');
      await tx.tenants.insert({
        tenant_code: body.code,
        company: body.name,
        tier: body.tier,
        cell_id: body.cell,
        status: 'pending',
      });
      break;
    }
    case 'tenant-update': {
      const tenant = await tx.tenants.findById(body.target);
      const selected = await tx.cells.findById(body.cell);
      if (!tenant || !selected?.enabled) throw new HttpError('INVALID_INPUT');
      if (
        tenant.cell_id !== body.cell &&
        (tenant.status !== 'pending' ||
          tenant.provisioned ||
          (await tx.portal_user_tenants.findWhere({ tenant_id: tenant.id }))
            .length)
      )
        throw new HttpError('CONFLICT');
      await tx.tenants.update(tenant.id, {
        tier: body.tier,
        cell_id: body.cell,
      });
      break;
    }
    case 'status': {
      const tenant = await tx.tenants.findById(body.target);
      if (!tenant || !tenant.provisioned) throw new HttpError('CONFLICT');
      await tx.tenants.update(tenant.id, {
        status: body.status,
        revision: tenant.revision + 1,
      });
      break;
    }
    case 'grant': {
      throw new HttpError('CONFLICT');
    }
    case 'member': {
      await assigned(tx, body.target);
      let user = await tx.portal_users.byEmail(body.email);
      if (!user) {
        if (!body.password) throw new HttpError('INVALID_INPUT');
        user = await tx.portal_users.insert({
          email: body.email,
          password_hash: await hashPassword(body.password, config.password),
          status: 'active',
          is_root: false,
          must_change_password: true,
        });
      }
      if (user.is_root || user.status !== 'active')
        throw new HttpError('FORBIDDEN');
      const existing = await tx.portal_user_tenants.findWhere({
        portal_user_id: user.id,
      });
      if (existing.some(m => m.tenant_id === body.target))
        throw new HttpError('CONFLICT');
      if (
        existing.some(
          m =>
            m.status === 'active' &&
            (m.user_type !== 'vendor' || body.kind !== 'vendor')
        )
      )
        throw new HttpError('CONFLICT');
      const record = randomUUID();
      const member = await tx.portal_user_tenants.insert({
        portal_user_id: user.id,
        tenant_id: body.target,
        status: 'active',
        user_type: body.kind,
        entity_id: record,
        ready: false,
      });
      const job = await tx.provisioning_jobs.insert({
        tenant_id: body.target,
        membership_id: member.id,
        record_id: record,
        vendor_id: body.kind === 'vendor' ? randomUUID() : null,
        kind: body.kind,
        stage: 'pending',
        failure_code: null,
      });
      return job.id;
    }
    case 'revoke': {
      const member = await tx.portal_user_tenants.findById(body.membership);
      if (!member) throw new HttpError('NOT_FOUND');
      const user = await tx.portal_users.lockIdentity(member.portal_user_id);
      if (!user || user.is_root) throw new HttpError('FORBIDDEN');
      const assignedTenant = await assigned(tx, member.tenant_id);
      const cell = cells.get(assignedTenant.cell_id);
      await withTenantTransaction(cell, member.tenant_id, async local => {
        await local.roles.lockTenant(member.tenant_id);
        await protectTenantAdmin(local, member.id);
        const binding = await local.tenant_user_bindings.findById(member.id);
        if (binding)
          await local.tenant_user_bindings.update(binding.id, {
            status: 'locked',
            revision: member.revision + 1,
          });
        await tx.portal_user_tenants.update(member.id, {
          status: 'locked',
          ready: false,
          revision: member.revision + 1,
        });
      });
      const job = await tx.provisioning_jobs.findOneBy({
        membership_id: member.id,
      });
      if (job)
        await tx.provisioning_jobs.update(job.id, {
          stage: 'pending',
          failure_code: null,
        });
      break;
    }
    case 'retry':
      await runJob(tx, cells, body.job, body.name);
      break;
    case 'reconcile': {
      const root = await tx.portal_users.lockIdentity(actor);
      if (!root?.is_root) throw new HttpError('FORBIDDEN');
      const memberships = await tx.portal_user_tenants.findWhere({
        portal_user_id: actor,
      });
      const membership = memberships[0];
      const selected = await tx.cells.findById(body.cell);
      if (!membership || !selected?.enabled) throw new HttpError('FORBIDDEN');
      const tenant = await tx.tenants.findById(membership.tenant_id);
      if (!tenant || (tenant.cell_id && tenant.cell_id !== body.cell))
        throw new HttpError('CONFLICT');
      const cell = cells.get(body.cell);
      await tx.tenants.update(tenant.id, { cell_id: body.cell });
      await projectTenant(tx, cell, tenant.id);
      await withTenantTransaction(cell, tenant.id, async local => {
        await seedTenantRoles(local, tenant.id);
        if (!(await local.tenant_user_bindings.findById(membership.id)))
          await local.tenant_user_bindings.insert({
            id: membership.id,
            tenant_id: tenant.id,
            portal_user_id: actor,
            entity_id: null,
            user_type: null,
            status: 'active',
          });
      });
      await withTenantTransaction(cell, tenant.id, local =>
        seedTenantAdmin(local, tenant.id, membership.id)
      );
      await tx.tenants.update(tenant.id, {
        provisioned: true,
        rbac_ready: true,
      });
      break;
    }
    case 'activate': {
      const tenant = await assigned(tx, body.target);
      const cell = cells.get(tenant.cell_id);
      if (tenant.provisioned && !tenant.rbac_ready)
        throw new HttpError('CONFLICT');
      if (
        tenant.status !== 'pending' &&
        !(tenant.status === 'active' && tenant.provisioned)
      )
        throw new HttpError('CONFLICT');
      const members = await tx.portal_user_tenants.findWhere({
        tenant_id: tenant.id,
        status: 'active',
      });
      if (members.some(m => !m.ready)) throw new HttpError('CONFLICT');
      const eligible = members.filter(m => m.user_type === 'employee');
      const admin = body.administrator
        ? eligible.find(m => m.id === body.administrator)
        : eligible.length === 1 || tenant.status === 'active'
          ? eligible[0]
          : undefined;
      if (!admin || !admin.entity_id) throw new HttpError('CONFLICT');
      await projectTenant(tx, cell, tenant.id);
      await withTenantTransaction(cell, tenant.id, async local => {
        await local.roles.lockTenant(tenant.id);
        if (tenant.status === 'pending')
          await seedTenantAdmin(local, tenant.id, admin.id);
        const role = await local.roles.findOneBy({ code: 'tenant_admin' });
        const assignments = role
          ? await local.role_assignments.findWhere({
              role_id: role.id,
              scope: 'tenant',
            })
          : [];
        if (!assignments.some(a => members.some(m => m.id === a.binding_id)))
          throw new HttpError('CONFLICT');
        const source = await tx.tenants.findById(tenant.id);
        const projected = await local.cell_tenants.findById(tenant.id);
        // A prior cell commit may survive an admin rollback. Accept only the exact next activation revision.
        const current =
          projected?.revision === source?.revision &&
          projected?.status === source?.status;
        const interrupted =
          source?.status === 'pending' &&
          projected?.status === 'active' &&
          projected.revision === source.revision + 1;
        if (
          !source ||
          !projected ||
          projected.code !== source.tenant_code ||
          (!current && !interrupted)
        )
          throw new HttpError('CONFLICT');
        for (const member of members) {
          const binding = await local.tenant_user_bindings.findById(member.id);
          if (
            !binding ||
            binding.revision !== member.revision ||
            binding.status !== member.status ||
            binding.portal_user_id !== member.portal_user_id ||
            binding.entity_id !== member.entity_id ||
            binding.user_type !== member.user_type ||
            !member.entity_id
          )
            throw new HttpError('CONFLICT');
          const record =
            member.user_type === 'employee'
              ? await local.employees.findById(member.entity_id)
              : member.user_type === 'client'
                ? await local.clients.findById(member.entity_id)
                : member.user_type === 'vendor'
                  ? await local.vendor_contacts.findById(member.entity_id)
                  : null;
          if (!record?.is_app_user) throw new HttpError('CONFLICT');
          if (
            'vendor_id' in record &&
            (typeof record.vendor_id !== 'string' ||
              !(await local.vendors.findById(record.vendor_id)))
          )
            throw new HttpError('CONFLICT');
        }
      });
      await withTenantTransaction(cell, randomUUID(), async local => {
        for (const repository of [
          local.cell_tenants,
          local.tenant_user_bindings,
          local.employees,
          local.clients,
          local.vendors,
          local.vendor_contacts,
        ]) {
          if ((await repository.findWhere({ tenant_id: tenant.id })).length)
            throw new Error('Isolation proof failed');
        }
      });
      if (tenant.status === 'pending')
        await tx.tenants.update(tenant.id, {
          revision: tenant.revision + 1,
          status: 'active',
          provisioned: true,
          rbac_ready: true,
        });
      await projectTenant(tx, cell, tenant.id);
      break;
    }
  }
}
