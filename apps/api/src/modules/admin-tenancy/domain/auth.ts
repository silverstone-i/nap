/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomBytes } from 'node:crypto';
import { transportVersion } from '@nap/shared';
import { hashPassword, verifyPassword } from '../../../util/password.js';
import {
  cookieOptions,
  sessionCookieName,
} from '../../../util/sessionCookie.js';
import { requestContext } from '../../../util/requestContext.js';
import { HttpError } from '../../../util/httpError.js';
import { logger } from '../../../util/logger.js';
import {
  checkThrottle,
  throttleKeys,
} from '../../../services/loginThrottle.js';
import { createSession } from '../../../services/sessions.js';
import type { AdminRepositories } from '../../../db/admin/repositories.js';
import type { AdminTransaction } from '../../../db/withAdminTransaction.js';
import type { AuthConfiguration } from '../../../util/authConfig.js';
import type { ExtensionInput } from '../../../framework/createRouter.js';

/**
 * Does: Builds login behavior with one lazily cached dummy hash per router.
 * Called by: the auth router factory at application construction.
 */
export function loginOperation(config: AuthConfiguration) {
  let dummy: Promise<string> | undefined;
  return async (
    tx: AdminTransaction<AdminRepositories>,
    input: ExtensionInput<
      { email: string; password: string },
      object,
      object,
      'anonymous'
    >
  ) => {
    const keys = throttleKeys(
      input.body.email,
      input.clientAddress ?? 'unknown',
      config.throttleSecret
    );
    if (await checkThrottle(tx, keys)) {
      input.reply.refuseLogin('THROTTLED');
      return undefined;
    }
    const identity = await tx.portal_users.byEmail(input.body.email);
    const fallback = await (dummy ??= hashPassword(
      randomBytes(32).toString('hex'),
      config.password
    ));
    let valid = false;
    try {
      valid = await verifyPassword(
        identity?.password_hash ?? fallback,
        input.body.password
      );
    } catch {
      await verifyPassword(fallback, input.body.password);
    }
    // Always query membership, including for unknown or locked identities.
    const tenants = await tx.portal_user_tenants.activeFor(
      identity?.id ?? '00000000-0000-0000-0000-000000000000'
    );
    const tenant = tenants.length === 1 ? tenants[0] : undefined;
    if (!identity || identity.status !== 'active' || !valid || !tenant) {
      for (const key of keys) await tx.login_throttles.fail(key);
      logger.info({ event: 'auth.login_failed' });
      input.reply.refuseLogin('UNAUTHENTICATED');
      return undefined;
    }
    const context = requestContext.getStore();
    if (!context) throw new Error('Missing request context');
    context.actorId = identity.id;
    const result = await createSession(tx, config, identity, tenant);
    const emailKey = keys[0];
    if (emailKey) await tx.login_throttles.clearEmail(emailKey);
    input.reply.setCookie(
      sessionCookieName,
      result.cookie,
      cookieOptions(config)
    );
    return { version: transportVersion, data: result.view };
  };
}

/**
 * Does: Revokes the proven cookie reference and clears its cookie even when its session has expired.
 * Called by: the anonymous logout route.
 */
export async function logout(
  tx: AdminTransaction<AdminRepositories>,
  input: ExtensionInput<undefined, object, object, 'anonymous'>,
  config: AuthConfiguration
) {
  const presented = input.presentedSession;
  if (presented) {
    await tx.portal_users.lockIdentity(presented.actorId);
    const context = requestContext.getStore();
    if (!context) throw new Error('Missing request context');
    context.actorId = presented.actorId;
    await tx.sessions.removeWhere({ id: presented.id });
  }
  input.reply.clearCookie(sessionCookieName, cookieOptions(config));
  return { version: transportVersion, data: null };
}

/**
 * Does: Checks current credentials, changes the hash, and revokes other sessions in one transaction.
 * Called by: the authenticated password route.
 */
export async function changePassword(
  tx: AdminTransaction<AdminRepositories>,
  input: ExtensionInput<
    { currentPassword: string; newPassword: string },
    object,
    object,
    'authenticated'
  >,
  config: AuthConfiguration
) {
  const identity = await tx.portal_users.lockIdentity(input.session.actorId);
  const sessionId = input.session.sessionId;
  if (!identity || !sessionId || identity.status !== 'active')
    throw new HttpError('UNAUTHENTICATED');
  const row = await tx.sessions.reference(sessionId);
  const memberships = await tx.portal_user_tenants.activeFor(identity.id);
  if (
    !row ||
    row.deactivated_at ||
    row.idle_expires_at.getTime() <= Date.now() ||
    row.absolute_expires_at.getTime() <= Date.now() ||
    !memberships.some(m => m.tenant_id === row.tenant_id)
  )
    throw new HttpError('UNAUTHENTICATED');
  if (
    !(await verifyPassword(identity.password_hash, input.body.currentPassword))
  )
    throw new HttpError('UNAUTHENTICATED');
  await tx.portal_users.update(identity.id, {
    password_hash: await hashPassword(input.body.newPassword, config.password),
  });
  await tx.sessions.revokeOthers(identity.id, sessionId);
  return { version: transportVersion, data: null };
}
