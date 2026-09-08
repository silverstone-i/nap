/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { controlBodySchema } from '@nap/shared';
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import { hashPassword } from '../util/password.js';
import { HttpError } from '../util/httpError.js';
import { audit, requirePlatform } from './platform.js';
import type { AdminRepositories } from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
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
    members: (await tx.portal_user_tenants.findWhere({}))
      .slice(0, 200)
      .map(({ id, portal_user_id, tenant_id, status, user_type, ready }) => ({
        id,
        portal_user_id,
        tenant_id,
        status,
        user_type,
        ready,
      })),
    jobs: (await tx.provisioning_jobs.findWhere({}))
      .slice(0, 200)
      .map(({ id, tenant_id, stage, failure_code }) => ({
        id,
        tenant_id,
        stage,
        failure_code,
      })),
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
/** Does: Confirms that a requested operation targets this deployment's registered cell. Called by: provisioning and activation. */
async function assigned(
  tx: AdminTransaction<AdminRepositories>,
  id: string,
  config: AuthConfiguration
) {
  const tenant = await tx.cells.assignment(id);
  if (!tenant || tenant.code !== config.cellCode || !tenant.enabled)
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
  cell: CellHandle,
  jobId: string,
  config: AuthConfiguration,
  name?: string
) {
  const job = await tx.provisioning_jobs.findById(jobId);
  if (!job) throw new HttpError('NOT_FOUND');
  await assigned(tx, job.tenant_id, config);
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
  } catch {
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
  cell: CellHandle,
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
      const user = await tx.portal_users.lockIdentity(body.user);
      if (!user || user.is_root) throw new HttpError('FORBIDDEN');
      if (
        body.role === 'support' &&
        ![
          'admin-tenancy::control::access',
          'admin-tenancy::control::impersonate',
          'admin-tenancy::control::audit',
        ].includes(body.permission)
      )
        throw new HttpError('FORBIDDEN');
      const existing = await tx.platform_grants.findOneBy({
        portal_user_id: body.user,
        permission: body.permission,
      });
      if (!body.enabled) {
        if (existing) await tx.platform_grants.removeWhere({ id: existing.id });
      } else if (existing)
        await tx.platform_grants.update(existing.id, { role: body.role });
      else
        await tx.platform_grants.insert({
          portal_user_id: body.user,
          role: body.role,
          permission: body.permission,
        });
      break;
    }
    case 'member': {
      await assigned(tx, body.target, config);
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
      await tx.portal_user_tenants.update(member.id, {
        status: 'locked',
        ready: false,
        revision: member.revision + 1,
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
      await runJob(tx, cell, body.job, config, body.name);
      break;
    case 'reconcile': {
      const root = await tx.portal_users.lockIdentity(actor);
      if (!root?.is_root) throw new HttpError('FORBIDDEN');
      const memberships = await tx.portal_user_tenants.findWhere({
        portal_user_id: actor,
      });
      const membership = memberships[0];
      const selected = await tx.cells.findById(body.cell);
      if (
        !membership ||
        !selected?.enabled ||
        selected.code !== config.cellCode
      )
        throw new HttpError('FORBIDDEN');
      const tenant = await tx.tenants.findById(membership.tenant_id);
      if (!tenant || (tenant.cell_id && tenant.cell_id !== body.cell))
        throw new HttpError('CONFLICT');
      await tx.tenants.update(tenant.id, { cell_id: body.cell });
      await projectTenant(tx, cell, tenant.id);
      await withTenantTransaction(cell, tenant.id, async local => {
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
      await tx.tenants.update(tenant.id, { provisioned: true });
      break;
    }
    case 'activate': {
      const tenant = await assigned(tx, body.target, config);
      if (tenant.status !== 'pending') throw new HttpError('CONFLICT');
      const members = await tx.portal_user_tenants.findWhere({
        tenant_id: tenant.id,
        status: 'active',
      });
      if (members.some(m => !m.ready)) throw new HttpError('CONFLICT');
      const admin = members.find(m => m.user_type === 'employee');
      if (!admin || !admin.entity_id) throw new HttpError('CONFLICT');
      await projectTenant(tx, cell, tenant.id);
      await withTenantTransaction(cell, tenant.id, async local => {
        if (!(await local.employees.findById(admin.entity_id!)))
          throw new HttpError('CONFLICT');
      });
      await withTenantTransaction(cell, randomUUID(), async local => {
        if (await local.employees.findById(admin.entity_id!))
          throw new Error('Isolation proof failed');
      });
      await tx.tenants.update(tenant.id, {
        revision: tenant.revision + 1,
        status: 'active',
        provisioned: true,
      });
      await projectTenant(tx, cell, tenant.id);
      break;
    }
  }
}
