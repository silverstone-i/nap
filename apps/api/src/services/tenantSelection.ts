/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { HttpError } from '../util/httpError.js';
import { audit, requirePlatform } from './platform.js';
import { rotateSession } from './sessions.js';
import type { AdminRepositories } from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
import type { AuthConfiguration } from '../util/authConfig.js';
import type { ResolvedSession } from '../util/resolvedSession.js';

/** Does: Locks and validates the actual session before changing its access. Called by: selection and access actions. */
async function current(
  tx: AdminTransaction<AdminRepositories>,
  session: ResolvedSession
) {
  await tx.cells.lockControl();
  const operator = session.operatorId ?? session.actorId;
  const user = await tx.portal_users.lockIdentity(operator);
  const row = session.sessionId
    ? await tx.sessions.reference(session.sessionId)
    : null;
  if (
    !user ||
    user.status !== 'active' ||
    user.must_change_password ||
    !row ||
    row.portal_user_id !== operator ||
    row.deactivated_at ||
    row.absolute_expires_at.getTime() <= Date.now() ||
    row.idle_expires_at.getTime() <= Date.now()
  )
    throw new HttpError('FORBIDDEN');
  return { row, user };
}
/** Does: Lists only this identity's current active memberships. Called by: the auth membership endpoint. */
export async function memberships(
  tx: AdminTransaction<AdminRepositories>,
  session: ResolvedSession
) {
  const { user, row } = await current(tx, session);
  if (row.access_mode) throw new HttpError('FORBIDDEN');
  return (await tx.portal_user_tenants.activeFor(user.id)).map(m => ({
    id: m.id,
    tenantCode: m.tenant_code,
    company: m.company,
    userType: m.user_type,
  }));
}
/** Does: Selects a checked membership and rotates only this session. Called by: tenant picker. */
export async function selectTenant(
  tx: AdminTransaction<AdminRepositories>,
  session: ResolvedSession,
  membershipId: string,
  config: AuthConfiguration
) {
  const { user, row } = await current(tx, session);
  if (row.access_mode) throw new HttpError('FORBIDDEN');
  const m = (await tx.portal_user_tenants.activeFor(user.id)).find(
    m => m.id === membershipId
  );
  if (!m) throw new HttpError('FORBIDDEN');
  const target = await tx.cells.assignment(m.tenant_id);
  if (
    !target ||
    !target.provisioned ||
    !target.enabled ||
    target.code !== config.cellCode
  )
    throw new HttpError('FORBIDDEN');
  await tx.sessions.update(row.id, { tenant_id: m.tenant_id });
  return rotateSession(tx, row.id, config);
}
/** Does: Enters audited tenant access or impersonation without creating ordinary membership. Called by: operator access form. */
export async function startAccess(
  tx: AdminTransaction<AdminRepositories>,
  session: ResolvedSession,
  input: { target: string; user?: string; reason: string },
  config: AuthConfiguration
) {
  const { user, row } = await current(tx, session);
  if (row.access_mode) throw new HttpError('FORBIDDEN');
  const mode = input.user ? 'impersonation' : 'access';
  await requirePlatform(tx, user.id, input.user ? 'impersonate' : 'access');
  const target = await tx.cells.assignment(input.target);
  if (
    !target ||
    target.status !== 'active' ||
    !target.provisioned ||
    !target.enabled ||
    target.code !== config.cellCode
  )
    throw new HttpError('FORBIDDEN');
  if (input.user) {
    const effective = await tx.portal_users.lockIdentity(input.user);
    if (
      !effective ||
      effective.is_root ||
      effective.status !== 'active' ||
      effective.must_change_password ||
      !(await tx.portal_user_tenants.activeFor(effective.id)).some(
        m => m.tenant_id === input.target
      )
    )
      throw new HttpError('FORBIDDEN');
  }
  await audit(
    tx,
    user.id,
    `${mode}.start`,
    input.target,
    input.reason,
    input.user ?? null,
    row.id
  );
  await tx.sessions.update(row.id, {
    tenant_id: input.target,
    access_mode: mode,
    effective_user_id: input.user ?? null,
    access_reason: input.reason,
  });
  return rotateSession(tx, row.id, config);
}
/** Does: Ends controlled access and returns to selection without gaining tenant access. Called by: the access banner exit. */
export async function endAccess(
  tx: AdminTransaction<AdminRepositories>,
  session: ResolvedSession,
  config: AuthConfiguration
) {
  const { user, row } = await current(tx, session);
  if (!row.access_mode) throw new HttpError('CONFLICT');
  await audit(
    tx,
    user.id,
    `${row.access_mode}.end`,
    row.tenant_id,
    row.access_reason ?? 'Exit',
    row.effective_user_id,
    row.id
  );
  await tx.sessions.update(row.id, {
    tenant_id: null,
    access_mode: null,
    effective_user_id: null,
    access_reason: null,
  });
  return rotateSession(tx, row.id, config);
}
