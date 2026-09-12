/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { redisFixture } from '../fixtures/redis.js';
import { describe } from 'vitest';
import { z } from 'zod';
import {
  controlCommandResponseSchema,
  accessChangedSchema,
  accessOverviewSchema,
  effectiveAccessSchema,
} from '@nap/shared';
import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { multiCell } from '../fixtures/multiCell.js';
import { authEnv } from '../fixtures/authDatabase.js';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';
import { seedTenantRoles } from '../../src/services/roleSeeds.js';
import { transitionAccess } from '../../src/services/accessTransition.js';
import { withAdminTransaction } from '../../src/db/withAdminTransaction.js';
/** Does: Checks fixture record replies. Used by: RBAC integration assertions. */
const recordEnvelope = z.object({
  data: z.object({ id: z.uuid(), name: z.string() }),
});
/** Does: Checks fixture list replies. Used by: RBAC integration assertions. */
const recordsEnvelope = z.object({
  data: z.array(z.object({ id: z.uuid(), name: z.string() })),
  page: z.object({ total: z.number() }),
});
describe.each([false, true])('RBAC with cache=%s', cacheEnabled => {
  let redis: Awaited<ReturnType<typeof redisFixture>> | undefined;
  let test: Awaited<ReturnType<typeof multiCell>>;
  let root: string;
  let cells: string[];
  const auth = '/api/admin-tenancy/v1/auth';
  const control = '/api/admin-tenancy/v1/control';
  const access = '/api/core/v1/access';
  /** Does: Extracts a disposable browser session. Called by: test login helpers. */
  function cookie(reply: request.Response) {
    return String(reply.headers['set-cookie'][0]).split(';')[0];
  }
  /** Does: Sends an authorized operator action. Called by: fixture setup and tests. */
  async function command(action: string, body: object) {
    const r = await request(test.api.origin)
      .post(control + '/' + action)
      .set('Cookie', root)
      .send(body);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r;
  }
  /** Does: Creates a real user through recoverable provisioning. Called by: tenant setup and scope scenarios. */
  async function member(tenant: string) {
    const email = randomUUID() + '@nap.test';
    const job = await command('members', {
      operation: 'member',
      target: tenant,
      kind: 'employee',
      name: email,
      email,
      password: 'temporary-password-123',
    });
    await command('provision', {
      operation: 'retry',
      job: controlCommandResponseSchema.parse(job.body).data.jobId,
      name: email,
    });
    const user = (await test.admin.db.portal_users.findOneBy({ email }))!;
    const binding = (await test.admin.db.portal_user_tenants.findOneBy({
      portal_user_id: user.id,
      tenant_id: tenant,
    }))!;
    return { email, user, binding };
  }
  /** Does: Signs in and changes the temporary password. Called by: acceptance scenarios. */
  async function onboard(email: string) {
    const login = await request(test.api.origin)
      .post(auth + '/login')
      .send({ email, password: 'temporary-password-123' });
    expect(login.status).toBe(200);
    const session = cookie(login);
    const changed = await request(test.api.origin)
      .put(auth + '/password')
      .set('Cookie', session)
      .send({
        currentPassword: 'temporary-password-123',
        newPassword: 'replacement-password-123',
      });
    expect(changed.status).toBe(200);
    return session;
  }
  /** Does: Provisions an active tenant in one selected cell. Called by: acceptance scenarios. */
  async function tenant(index = 0) {
    const code = randomUUID().slice(0, 12);
    await command('registry', {
      operation: 'tenant',
      code,
      name: 'RBAC fixture',
      cell: cells[index],
    });
    const row = (await test.admin.db.tenants.findOneBy({ tenant_code: code }))!;
    const owner = await member(row.id);
    await command('provision', { operation: 'activate', target: row.id });
    return { id: row.id, owner, session: await onboard(owner.email) };
  }
  /** Does: Sends a tenant access mutation. Called by: scoped role scenarios. */
  async function change(session: string, body: object, expected = 200) {
    const r = await request(test.api.origin)
      .post(access + '/change')
      .set('Cookie', session)
      .send(body);
    expect(r.status, JSON.stringify(r.body)).toBe(expected);
    return expected === 200
      ? accessChangedSchema.parse(r.body).data
      : { id: randomUUID() };
  }
  /** Does: Creates a company/project through the production route. Called by: acceptance setup. */
  async function create(session: string, path: string, body: object) {
    const r = await request(test.api.origin)
      .post(path + '/')
      .set('Cookie', session)
      .send(body);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return recordEnvelope.parse(r.body).data;
  }
  const company = '/api/core/v1/companies';
  const project = '/api/projects/v1/projects';
  beforeAll(async () => {
    if (cacheEnabled) redis = await redisFixture();
    test = await multiCell(
      redis
        ? {
            REDIS_URL_TEST: redis.url,
            REDIS_CACHE_NAMESPACE_TEST: redis.namespace,
          }
        : {}
    );
    root = cookie(
      await request(test.api.origin)
        .post(auth + '/login')
        .send({
          email: authEnv.ROOT_EMAIL_TEST,
          password: authEnv.ROOT_PASSWORD_TEST,
        })
    );
    await command('registry', {
      operation: 'cell',
      code: 'cell-2',
      name: 'Second cell',
    });
    cells = [
      (await test.admin.db.cells.findOneBy({ code: 'cell-1' }))!.id,
      (await test.admin.db.cells.findOneBy({ code: 'cell-2' }))!.id,
    ];
    await command('provision', { operation: 'reconcile', cell: cells[0] });
  }, 30000);
  afterAll(async () => {
    await test?.cleanup();
    await redis?.cleanup();
  }, 30000);
  it('enforces real scoped assignments across companies, future projects, and a second cell', async () => {
    const t = await tenant(1);
    const other = await tenant(0);
    expect(
      (
        await request(test.api.origin)
          .get(project + '/')
          .set('Cookie', t.session)
      ).status
    ).toBe(403);
    await command('entitlement', {
      tenant: t.id,
      module: 'projects',
      enabled: true,
    });
    const a = await create(t.session, company, {
      code: 'A',
      name: 'Company A',
    });
    const b = await create(t.session, company, {
      code: 'B',
      name: 'Company B',
    });
    const a1 = await create(t.session, project, {
      code: 'A1',
      name: 'Project A1',
      company_id: a.id,
    });
    const b1 = await create(t.session, project, {
      code: 'B1',
      name: 'Project B1',
      company_id: b.id,
    });
    const employee = await member(t.id);
    const c = await onboard(employee.email);
    const overview = await request(test.api.origin)
      .get(access + '/overview')
      .set('Cookie', t.session);
    expect(overview.status, JSON.stringify(overview.body)).toBe(200);
    const roles = accessOverviewSchema.parse(overview.body).data.roles;
    const viewer = roles.find(r => r.code === 'project_viewer')!;
    const manager = roles.find(r => r.code === 'project_manager')!;
    const read = await change(t.session, {
      operation: 'assign',
      bindingId: employee.binding.id,
      roleId: viewer.id,
      scope: 'all_projects',
      targets: [],
    });
    const edit = await change(t.session, {
      operation: 'assign',
      bindingId: employee.binding.id,
      roleId: manager.id,
      scope: 'projects',
      targets: [a1.id],
    });
    expect(
      recordsEnvelope.parse(
        (
          await request(test.api.origin)
            .get(project + '/')
            .set('Cookie', c)
        ).body
      ).data
    ).toHaveLength(2);
    expect(
      (
        await request(test.api.origin)
          .get(company + '/')
          .set('Cookie', c)
      ).status
    ).toBe(403);
    expect(
      (
        await request(test.api.origin)
          .get(access + '/overview')
          .set('Cookie', c)
      ).status
    ).toBe(403);
    expect(
      (
        await request(test.api.origin)
          .put(project + '/update')
          .set('Cookie', c)
          .send({ ids: [a1.id], changes: { name: 'Allowed' } })
      ).status
    ).toBe(200);
    expect(
      (
        await request(test.api.origin)
          .put(project + '/update')
          .set('Cookie', c)
          .send({ ids: [b1.id], changes: { name: 'Forbidden' } })
      ).status
    ).toBe(404);
    expect(
      (
        await request(test.api.origin)
          .put(project + '/update')
          .set('Cookie', c)
          .send({ ids: [a1.id, b1.id], changes: { name: 'No partial write' } })
      ).status
    ).toBe(404);
    expect(
      recordEnvelope.parse(
        (
          await request(test.api.origin)
            .get(project + '/' + a1.id)
            .set('Cookie', c)
        ).body
      ).data.name
    ).toBe('Allowed');
    expect(
      (
        await request(test.api.origin)
          .put(project + '/update')
          .set('Cookie', t.session)
          .send({ ids: [a1.id], changes: { company_id: b.id } })
      ).status
    ).toBe(400);
    await create(t.session, project, {
      code: 'A2',
      name: 'Future project',
      company_id: a.id,
    });
    expect(
      recordsEnvelope.parse(
        (
          await request(test.api.origin)
            .get(project + '/')
            .set('Cookie', c)
        ).body
      ).page.total
    ).toBe(3);
    await change(t.session, { operation: 'revoke', id: read.id });
    expect(
      recordsEnvelope.parse(
        (
          await request(test.api.origin)
            .get(project + '/')
            .set('Cookie', c)
        ).body
      ).data
    ).toHaveLength(1);
    expect(
      (
        await request(test.api.origin)
          .get(project + '/' + b1.id)
          .set('Cookie', c)
      ).status
    ).toBe(404);
    await change(t.session, { operation: 'revoke', id: edit.id });
    expect(
      (
        await request(test.api.origin)
          .get(project + '/')
          .set('Cookie', c)
      ).status
    ).toBe(403);
    expect(
      (
        await request(test.api.origin)
          .get(company + '/' + a.id)
          .set('Cookie', other.session)
      ).status
    ).toBe(404);

    await change(t.session, {
      operation: 'assign',
      bindingId: employee.binding.id,
      roleId: manager.id,
      scope: 'company_projects',
      targets: [a.id],
    });
    const list = await request(test.api.origin)
      .get(project + '/')
      .set('Cookie', c);
    expect(recordsEnvelope.parse(list.body).data).toHaveLength(2);
    expect(recordsEnvelope.parse(list.body).page.total).toBe(2);
    const options = await request(test.api.origin)
      .get(project + '/company-options')
      .set('Cookie', c);
    expect(options.status).toBe(200);
    expect(
      z
        .object({ data: z.array(z.object({ id: z.uuid() })) })
        .parse(options.body)
        .data.map(r => r.id)
    ).toEqual([a.id]);
    await create(c, project, {
      code: 'OWN-COMPANY',
      name: 'Scoped creation',
      company_id: a.id,
    });
    expect(
      (
        await request(test.api.origin)
          .post(project + '/')
          .set('Cookie', c)
          .send({ code: 'NO', name: 'Other company', company_id: b.id })
      ).status
    ).toBe(403);
    await change(
      t.session,
      {
        operation: 'assign',
        bindingId: employee.binding.id,
        roleId: viewer.id,
        scope: 'projects',
        targets: [],
      },
      400
    );
    const foreign = recordsEnvelope.parse(
      (
        await request(test.api.origin)
          .get(company + '/')
          .set('Cookie', other.session)
      ).body
    ).data;
    expect(foreign).toEqual([]);
    const explanation = await request(test.api.origin)
      .get(access + '/effective?binding=' + employee.binding.id)
      .set('Cookie', t.session);
    expect(explanation.status).toBe(200);
    expect(effectiveAccessSchema.parse(explanation.body).data[0].scope).toBe(
      'company_projects'
    );
  }, 30000);
  it('disables centrally, rejects stale projections and recovers on explicit retry', async () => {
    const t = await tenant(1);
    await command('entitlement', {
      tenant: t.id,
      module: 'projects',
      enabled: true,
    });
    expect(
      (
        await request(test.api.origin)
          .get(project + '/')
          .set('Cookie', t.session)
      ).status
    ).toBe(200);
    await withTenantTransaction(test.cell2, t.id, async tx => {
      const row = (await tx.entitlement_projections.findOneBy({
        module: 'projects',
      }))!;
      await tx.entitlement_projections.update(row.id, { revision: 0 });
    });
    expect(
      (
        await request(test.api.origin)
          .get(project + '/')
          .set('Cookie', t.session)
      ).status
    ).toBe(403);
    await command('entitlement', {
      tenant: t.id,
      module: 'projects',
      enabled: true,
    });
    await command('entitlement', {
      tenant: t.id,
      module: 'projects',
      enabled: false,
    });
    // A stale enabled local projection never overrides the central revocation.
    await withTenantTransaction(test.cell2, t.id, async tx => {
      const row = (await tx.entitlement_projections.findOneBy({
        module: 'projects',
      }))!;
      await tx.entitlement_projections.update(row.id, { enabled: true });
    });
    expect(
      (
        await request(test.api.origin)
          .get(project + '/')
          .set('Cookie', t.session)
      ).status
    ).toBe(403);
    expect(
      (
        await request(test.api.origin)
          .post(control + '/entitlement')
          .set('Cookie', t.session)
          .send({ tenant: t.id, module: 'projects', enabled: true })
      ).status
    ).toBe(403);
  }, 30000);
  it('protects built-ins and last administrator, and preserves customized roles through seed replay', async () => {
    const t = await tenant();
    const overview = accessOverviewSchema.parse(
      (
        await request(test.api.origin)
          .get(access + '/overview')
          .set('Cookie', t.session)
      ).body
    ).data;
    const admin = overview.roles.find(r => r.code === 'tenant_admin')!;
    const assignment = overview.assignments.find(a => a.role_id === admin.id)!;
    await change(t.session, { operation: 'archive-role', id: admin.id }, 403);
    await change(t.session, { operation: 'revoke', id: assignment.id }, 409);
    expect(
      (
        await request(test.api.origin)
          .post(control + '/members')
          .set('Cookie', root)
          .send({
            operation: 'revoke',
            membership: t.owner.binding.id,
            reason: 'Test',
          })
      ).status
    ).toBe(409);
    const viewer = overview.roles.find(r => r.code === 'company_viewer')!;
    await change(t.session, {
      operation: 'role',
      id: viewer.id,
      code: viewer.code,
      name: 'Customized',
      capabilities: [],
      fields: [],
    });
    await withTenantTransaction(test.cell, t.id, async tx => {
      await seedTenantRoles(tx, t.id);
      expect((await tx.roles.findById(viewer.id))?.name).toBe('Customized');
      expect((await tx.roles.findById(viewer.id))?.capabilities).toEqual([]);
    });
    await change(t.session, { operation: 'archive-role', id: viewer.id });
    await withTenantTransaction(test.cell, t.id, async tx => {
      await seedTenantRoles(tx, t.id);
      expect(await tx.roles.findById(viewer.id)).toBeNull();
      expect((await tx.access_events.findWhere({})).length).toBeGreaterThan(0);
    });
  }, 30000);
  it('requires explicit legacy operator mapping and support cannot manage its own grants', async () => {
    const t = await tenant();
    await test.admin.db.platform_grants.insert({
      portal_user_id: t.owner.user.id,
      role: 'package_admin',
      permission: 'admin-tenancy::control::overview',
    });
    await expect(
      transitionAccess(test.admin, test.cell, {
        operator: test.root.actorId,
        cell: test.cellId,
        platform: [],
        tenants: [],
      })
    ).rejects.toThrow('Unmapped legacy operator');
    expect(
      (
        await request(test.api.origin)
          .get(control + '/overview')
          .set('Cookie', t.session)
      ).status
    ).toBe(403);
    await command('role-policy', {
      operation: 'platform-role',
      user: t.owner.user.id,
      role: 'support',
      enabled: true,
    });
    expect(
      (
        await request(test.api.origin)
          .get(control + '/overview')
          .set('Cookie', t.session)
      ).status
    ).toBe(200);
    expect(
      (
        await request(test.api.origin)
          .post(control + '/role-policy')
          .set('Cookie', t.session)
          .send({ operation: 'support-policy', permissions: [] })
      ).status
    ).toBe(403);
    expect(
      (
        await request(test.api.origin)
          .post(auth + '/access')
          .set('Cookie', t.session)
          .send({ target: test.root.tenantId, reason: 'Support test' })
      ).status
    ).toBe(403);
    const before = await withAdminTransaction(test.admin, tx =>
      tx.platform_roles.findWhere({ portal_user_id: t.owner.user.id })
    );
    expect(before[0]?.role).toBe('support');
  }, 30000);
  it('refuses access changes when audit cannot persist and denies unavailable entitlement authority', async () => {
    const t = await tenant();
    const owner = test.fixture.owner(test.fixture.cellUrl);
    await owner.none('REVOKE INSERT ON app.access_events FROM $1:name', [
      test.fixture.role,
    ]);
    try {
      await change(
        t.session,
        {
          operation: 'role',
          code: 'blocked_audit',
          name: 'Blocked audit',
          capabilities: [],
          fields: [],
        },
        500
      );
      await withTenantTransaction(test.cell, t.id, async tx => {
        expect(await tx.roles.findOneBy({ code: 'blocked_audit' })).toBeNull();
      });
    } finally {
      await owner.none('GRANT INSERT ON app.access_events TO $1:name', [
        test.fixture.role,
      ]);
    }
    await test.owner.none(
      'REVOKE SELECT ON admin.cache_revisions, admin.module_entitlements FROM $1:name',
      [test.fixture.role]
    );
    try {
      expect(
        (
          await request(test.api.origin)
            .get(company + '/')
            .set('Cookie', t.session)
        ).status
      ).toBe(500);
    } finally {
      await test.owner.none(
        'GRANT SELECT ON admin.cache_revisions, admin.module_entitlements TO $1:name',
        [test.fixture.role]
      );
    }
    expect(
      (
        await request(test.api.origin)
          .get(company + '/')
          .set('Cookie', t.session)
      ).status
    ).toBe(200);
  }, 30000);
  it('applies a reviewed legacy mapping and replays without changing tenant customizations', async () => {
    const tenants: { tenant: string; administrators: string[] }[] = [];
    for (const t of await test.admin.db.tenants.findWhere({
      provisioned: true,
    })) {
      if ((await test.admin.db.cells.assignment(t.id))?.code !== 'cell-1')
        continue;
      const members = await test.admin.db.portal_user_tenants.findWhere({
        tenant_id: t.id,
        status: 'active',
        ready: true,
      });
      tenants.push({ tenant: t.id, administrators: [members[0].id] });
    }
    const legacy = await test.admin.db.platform_grants.findWhere({});
    const users = [...new Set(legacy.map(g => g.portal_user_id))].filter(
      id => id !== test.root.actorId
    );
    const mapping = {
      operator: test.root.actorId,
      cell: test.cellId,
      tenants,
      platform: users.map(user => ({ user, role: 'support' as const })),
    };
    const blocked = tenants.find(t => t.tenant !== test.root.tenantId)!;
    await test.admin.db.tenants.update(blocked.tenant, { rbac_ready: false });
    await expect(
      transitionAccess(test.admin, test.cell, { ...mapping, tenants: [] })
    ).rejects.toThrow('Unmapped tenant administrator');
    expect(
      (await test.admin.db.tenants.findById(blocked.tenant))?.rbac_ready
    ).toBe(false);
    expect(
      (
        await request(test.api.origin)
          .post(control + '/provision')
          .set('Cookie', root)
          .send({ operation: 'activate', target: blocked.tenant })
      ).status
    ).toBe(409);
    await transitionAccess(test.admin, test.cell, mapping);
    await transitionAccess(test.admin, test.cell, mapping);
    for (const entry of tenants)
      await withTenantTransaction(test.cell, entry.tenant, async tx => {
        const role = (await tx.roles.findOneBy({ code: 'tenant_admin' }))!;
        expect(
          await tx.role_assignments.findWhere({
            binding_id: entry.administrators[0],
            role_id: role.id,
          })
        ).toHaveLength(1);
      });
    for (const user of users)
      expect(
        (
          await test.admin.db.platform_roles.findWhere({ portal_user_id: user })
        ).map(r => r.role)
      ).toEqual(['support']);
  }, 30000);
  it('gives executives future company/project visibility without administration or editing', async () => {
    const t = await tenant();
    await command('entitlement', {
      tenant: t.id,
      module: 'projects',
      enabled: true,
    });
    const employee = await member(t.id);
    const session = await onboard(employee.email);
    const overview = accessOverviewSchema.parse(
      (
        await request(test.api.origin)
          .get(access + '/overview')
          .set('Cookie', t.session)
      ).body
    ).data;
    const role = overview.roles.find(r => r.code === 'executive')!;
    await change(t.session, {
      operation: 'assign',
      bindingId: employee.binding.id,
      roleId: role.id,
      scope: 'tenant',
      targets: [],
    });
    const parent = await create(t.session, company, {
      code: 'FUTURE',
      name: 'Future company',
    });
    const child = await create(t.session, project, {
      code: 'FUTURE',
      name: 'Future project',
      company_id: parent.id,
    });
    for (const [path, id] of [
      [company, parent.id],
      [project, child.id],
    ]) {
      expect(
        (
          await request(test.api.origin)
            .get(path + '/' + id)
            .set('Cookie', session)
        ).status
      ).toBe(200);
      expect(
        (
          await request(test.api.origin)
            .put(path + '/update')
            .set('Cookie', session)
            .send({ ids: [id], changes: { name: 'Denied' } })
        ).status
      ).toBe(403);
    }
    expect(
      (
        await request(test.api.origin)
          .get(access + '/overview')
          .set('Cookie', session)
      ).status
    ).toBe(403);
    const entered = await request(test.api.origin)
      .post(auth + '/access')
      .set('Cookie', root)
      .send({ target: t.id, reason: 'RBAC controlled resource verification' });
    expect(entered.status).toBe(200);
    const controlled = cookie(entered);
    expect(
      (
        await request(test.api.origin)
          .put(project + '/update')
          .set('Cookie', controlled)
          .send({ ids: [child.id], changes: { name: 'Controlled update' } })
      ).status
    ).toBe(200);
    await withTenantTransaction(test.cell, t.id, async tx => {
      expect((await tx.projects.findById(child.id))?.updated_by).toBe(
        test.root.actorId
      );
    });
    const exited = await request(test.api.origin)
      .post(auth + '/end-access')
      .set('Cookie', controlled);
    expect(exited.status).toBe(200);
    root = cookie(exited);
  }, 30000);
  it('applies shared support changes to all support users on their next request', async () => {
    const a = await tenant();
    const b = await tenant();
    const previous = (await test.admin.db.support_policy.findOneBy({
      code: 'support',
    }))!;
    for (const t of [a, b])
      await command('role-policy', {
        operation: 'platform-role',
        user: t.owner.user.id,
        role: 'support',
        enabled: true,
      });
    try {
      await command('role-policy', {
        operation: 'support-policy',
        permissions: ['admin-tenancy::control::overview'],
      });
      for (const t of [a, b])
        expect(
          (
            await request(test.api.origin)
              .get(control + '/overview')
              .set('Cookie', t.session)
          ).status
        ).toBe(200);
      await command('role-policy', {
        operation: 'support-policy',
        permissions: [],
      });
      for (const t of [a, b])
        expect(
          (
            await request(test.api.origin)
              .get(control + '/overview')
              .set('Cookie', t.session)
          ).status
        ).toBe(403);
    } finally {
      await command('role-policy', {
        operation: 'support-policy',
        permissions: previous.permissions,
      });
    }
  }, 30000);
});
