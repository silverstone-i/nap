/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { AdminAccessError } from './errors.js';
import {
  permits,
  requireCapability,
  resolveAuthorization,
} from './authorization.js';
import { parseUuid } from './validation.js';

const READ = 'admin-tenancy::roles::read';
const WRITE = 'admin-tenancy::roles::write';

function roleError(code) {
  const error = new AdminAccessError(code);
  error.code = code;
  return error;
}

async function targetUser(db, userId) {
  const user = await db.portal_users.findOneBy(
    { id: userId, status: 'active' },
    { columnWhitelist: ['id', 'is_root'] }
  );
  if (!user) throw roleError('NOT_FOUND');
  return user;
}

async function requireMembership(db, userId, tenantId) {
  const membership = await db.portal_user_tenants.findOneBy(
    { portal_user_id: userId, tenant_id: tenantId, status: 'active' },
    { columnWhitelist: ['id'] }
  );
  if (!membership) throw roleError('FORBIDDEN');
}

function projection(row) {
  return {
    id: row.id,
    user: row.portal_user_id,
    tenant: row.tenant_id,
    role: row.role_id,
  };
}

async function roleFor(roleProvider, tenantId, roleId) {
  const [role] = await roleProvider.resolve(tenantId, [roleId]);
  if (!role) throw roleError('NOT_FOUND');
  return role;
}

async function recordChange(db, tx, event, userId, tenantId) {
  await db.managed_events.append(
    {
      deduplication_key: randomUUID(),
      event_key: event.event_key,
      outcome: 'succeeded',
      request_id: event.requestId ?? null,
      actor_id: event.actorId,
      tenant_id: tenantId,
      target_type: 'portal_user',
      target_id: userId,
      session_id: event.sessionId ?? null,
      details: { role: event.roleId },
    },
    { tx }
  );
  await db.cache_revisions.advance(
    [
      { domain: 'roles', entity: userId },
      { domain: 'roles', entity: tenantId },
    ],
    { tx }
  );
}

export async function listRolesForTenant(db, roleProvider, session, tenantId) {
  const tenant = parseUuid(tenantId);
  const authority = await resolveAuthorization(db, roleProvider, session);
  requireCapability(authority, READ, tenant);
  return { roles: await roleProvider.list(tenant) };
}

export async function listRolesForUser(db, roleProvider, session, userId) {
  const user = parseUuid(userId);
  const authority = await resolveAuthorization(db, roleProvider, session);
  const permittedTenants = authority.tenantGrants
    .filter(grant => permits(authority, READ, grant.tenantId))
    .map(grant => grant.tenantId);
  const platformRead = permits(authority, READ);
  if (!platformRead && permittedTenants.length === 0)
    throw roleError('FORBIDDEN');
  await targetUser(db, user);
  let rows = await db.platform_roles.findWhere(
    { portal_user_id: user },
    'AND',
    { columnWhitelist: ['id', 'portal_user_id', 'tenant_id', 'role_id'] }
  );
  rows = rows.filter(row => permits(authority, READ, row.tenant_id));
  const assignments = [];
  for (const [tenant, tenantRows] of Map.groupBy(rows, row => row.tenant_id)) {
    const roles = await roleProvider.resolve(
      tenant,
      tenantRows.map(row => row.role_id)
    );
    const valid = new Set(roles.map(role => role.id));
    assignments.push(
      ...tenantRows.filter(row => valid.has(row.role_id)).map(projection)
    );
  }
  assignments.sort(
    (left, right) =>
      left.tenant.localeCompare(right.tenant) || left.id.localeCompare(right.id)
  );
  return { assignments };
}

export async function grantRole(
  db,
  roleProvider,
  session,
  { tenantId, userId, roleId, requestId = null }
) {
  const tenant = parseUuid(tenantId);
  const user = parseUuid(userId);
  const roleUuid = parseUuid(roleId);
  const authority = await resolveAuthorization(db, roleProvider, session);
  requireCapability(authority, WRITE, tenant);
  if (authority.actorId === user) throw roleError('FORBIDDEN');
  const role = await roleFor(roleProvider, tenant, roleUuid);
  const target = await targetUser(db, user);
  if (target.is_root) throw roleError('FORBIDDEN');
  await requireMembership(db, user, tenant);
  try {
    return await db.tx(async tx => {
      await tx.one('SELECT id FROM admin.tenants WHERE id=$1 FOR UPDATE', [
        tenant,
      ]);
      const existing = await tx.oneOrNone(
        `SELECT id,portal_user_id,tenant_id,role_id,deactivated_at
           FROM admin.platform_roles
          WHERE portal_user_id=$1 AND tenant_id=$2 AND role_id=$3
          ORDER BY deactivated_at NULLS FIRST LIMIT 1 FOR UPDATE`,
        [user, tenant, roleUuid]
      );
      if (existing && !existing.deactivated_at) return projection(existing);
      const row = existing
        ? await tx.one(
            `UPDATE admin.platform_roles
                SET deactivated_at=NULL,updated_at=now(),updated_by=$2
              WHERE id=$1
              RETURNING id,portal_user_id,tenant_id,role_id`,
            [existing.id, authority.actorId]
          )
        : await tx.one(
            `INSERT INTO admin.platform_roles
               (portal_user_id,tenant_id,role_id,created_by,updated_by)
             VALUES($1,$2,$3,$4,$4)
             RETURNING id,portal_user_id,tenant_id,role_id`,
            [user, tenant, roleUuid, authority.actorId]
          );
      await recordChange(
        db,
        tx,
        {
          event_key: 'role.granted',
          actorId: authority.actorId,
          assignmentId: row.id,
          roleId: role.id,
          requestId,
          sessionId: session.id,
        },
        user,
        tenant
      );
      return projection(row);
    });
  } catch (error) {
    if (error?.code && !['23505', '40001', '40P01'].includes(error.code))
      throw error;
    throw roleError('CONFLICT');
  }
}

export async function removeRole(
  db,
  roleProvider,
  session,
  { tenantId, userId, roleId, requestId = null }
) {
  const tenant = parseUuid(tenantId);
  const user = parseUuid(userId);
  const roleUuid = parseUuid(roleId);
  const authority = await resolveAuthorization(db, roleProvider, session);
  requireCapability(authority, WRITE, tenant);
  const role = await roleFor(roleProvider, tenant, roleUuid);
  const target = await targetUser(db, user);
  if (target.is_root) throw roleError('FORBIDDEN');
  try {
    await db.tx(async tx => {
      await tx.one('SELECT id FROM admin.tenants WHERE id=$1 FOR UPDATE', [
        tenant,
      ]);
      const existing = await tx.oneOrNone(
        `SELECT id,portal_user_id,tenant_id,role_id
           FROM admin.platform_roles
          WHERE portal_user_id=$1 AND tenant_id=$2 AND role_id=$3
            AND deactivated_at IS NULL
          FOR UPDATE`,
        [user, tenant, roleUuid]
      );
      if (!existing) return;
      if (
        role.systemRole === 'platform_admin' &&
        tenant === authority.ownerTenantId
      ) {
        const count = await tx.one(
          `SELECT count(*)::integer AS count
             FROM admin.platform_roles
            WHERE tenant_id=$1 AND role_id=$2 AND deactivated_at IS NULL`,
          [tenant, roleUuid]
        );
        if (count.count <= 1) throw roleError('FORBIDDEN');
      }
      await tx.none(
        `UPDATE admin.platform_roles
            SET deactivated_at=now(),updated_at=now(),updated_by=$2
          WHERE id=$1`,
        [existing.id, authority.actorId]
      );
      await recordChange(
        db,
        tx,
        {
          event_key: 'role.revoked',
          actorId: authority.actorId,
          assignmentId: existing.id,
          roleId: role.id,
          requestId,
          sessionId: session.id,
        },
        user,
        tenant
      );
    });
  } catch (error) {
    if (error instanceof AdminAccessError) throw error;
    if (['40001', '40P01'].includes(error?.code)) throw roleError('CONFLICT');
    throw error;
  }
}
