/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { cachedAssignment } from './cachedSecurityState.js';
import { controlBodySchema, entitlementChangeSchema } from '@nap/shared';
import { withAdminTransaction } from '../db/withAdminTransaction.js';
import { HttpError } from '../util/httpError.js';
import { commandPermission } from './controlPlane.js';
import { requirePlatform } from './platform.js';
import type { AdminHandle } from '../db/admin/repositories.js';
import type { ResolvedSession } from '../util/resolvedSession.js';

/**
 * Does: Finds the assigned API deployment for a verified user's data request or operator command.
 * Called by: shared-origin routing before any outbound request.
 * Why: TEN-008 requires job destinations to come from central records, independently of the operator's selected tenant.
 */
export async function assignedDestination(
  db: AdminHandle,
  session: ResolvedSession | undefined,
  command?: { body: unknown; action: string }
) {
  if (!session) throw new HttpError('UNAUTHENTICATED');
  if (session.view?.state === 'password-change-required')
    throw new HttpError('FORBIDDEN');
  return withAdminTransaction(db, async tx => {
    let tenantId = session.view?.tenantId;
    if (command) {
      if (session.view?.controlledAccess) throw new HttpError('FORBIDDEN');
      if (command.action === 'entitlement') {
        const body = entitlementChangeSchema.safeParse(command.body);
        if (!body.success) throw new HttpError('INVALID_INPUT');
        await requirePlatform(
          tx,
          session.operatorId ?? session.actorId,
          'entitlement'
        );
        const target = await cachedAssignment(tx, body.data.tenant);
        if (!target?.enabled || !target.code) throw new HttpError('FORBIDDEN');
        return target.code;
      }
      const parsed = controlBodySchema.safeParse(command.body);
      if (!parsed.success) throw new HttpError('INVALID_INPUT');
      const body = parsed.data;
      if (commandPermission(body) !== command.action)
        throw new HttpError('FORBIDDEN');
      await requirePlatform(
        tx,
        session.operatorId ?? session.actorId,
        command.action
      );
      if (body.operation === 'retry') {
        const job = await tx.provisioning_jobs.findById(body.job);
        if (!job) throw new HttpError('NOT_FOUND');
        tenantId = job.tenant_id;
      } else if (body.operation === 'revoke') {
        const member = await tx.portal_user_tenants.findById(body.membership);
        if (!member) throw new HttpError('NOT_FOUND');
        tenantId = member.tenant_id;
      } else if (body.operation === 'activate' || body.operation === 'member') {
        tenantId = body.target;
      } else if (body.operation === 'reconcile') {
        const user = await tx.portal_users.lockIdentity(session.actorId);
        if (!user?.is_root) throw new HttpError('FORBIDDEN');
        const cell = await tx.cells.findById(body.cell);
        if (!cell?.enabled) throw new HttpError('FORBIDDEN');
        return cell.code;
      } else throw new HttpError('INVALID_INPUT');
    }
    if (!tenantId) throw new HttpError('FORBIDDEN');
    const target = await cachedAssignment(tx, tenantId);
    if (!target?.enabled || !target.code) throw new HttpError('FORBIDDEN');
    if (
      !command &&
      (!target.provisioned || !target.rbac_ready || target.status !== 'active')
    )
      throw new HttpError('FORBIDDEN');
    return target.code;
  });
}
