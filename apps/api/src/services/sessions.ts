/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { withAdminTransaction } from '../db/withAdminTransaction.js';
import { requestContext } from '../util/requestContext.js';
import {
  readReference,
  matchesSecret,
  secretDigest,
  sessionSecret,
  signReference,
} from '../util/sessionCookie.js';
import type {
  AdminHandle,
  AdminRepositories,
} from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
import type { AuthConfiguration } from '../util/authConfig.js';

/**
 * Does: Builds the public identity and expiry view from database records.
 * Called by: session creation and resolution.
 */
export function sessionView(
  row: { idle_expires_at: Date; absolute_expires_at: Date },
  actorId: string,
  email: string,
  tenantId: string,
  tenantCode: string
) {
  return {
    actorId,
    email,
    tenantId,
    tenantCode,
    expiresAt: new Date(
      Math.min(row.idle_expires_at.getTime(), row.absolute_expires_at.getTime())
    ).toISOString(),
  };
}

/**
 * Does: Creates an audited session and signs its private reference.
 * Called by: successful login inside the identity-locked transaction.
 */
export async function createSession(
  tx: AdminTransaction<AdminRepositories>,
  config: AuthConfiguration,
  identity: { id: string; email: string },
  tenant: { tenant_id: string; tenant_code: string }
) {
  const secret = sessionSecret();
  const now = new Date();
  const absolute = new Date(now.getTime() + config.absoluteHours * 3600000);
  const row = await tx.sessions.insert({
    portal_user_id: identity.id,
    tenant_id: tenant.tenant_id,
    token_hash: secretDigest(secret),
    last_seen_at: now,
    absolute_expires_at: absolute,
    idle_expires_at: new Date(
      Math.min(absolute.getTime(), now.getTime() + config.idleMinutes * 60000)
    ),
  });
  return {
    cookie: await signReference(row.id, secret, config.sessionSecret),
    view: sessionView(
      row,
      identity.id,
      identity.email,
      tenant.tenant_id,
      tenant.tenant_code
    ),
  };
}

/**
 * Does: Checks a signed reference against current database identity, membership, tenant, and expiry state.
 * Called by: the resolving middleware on requests presenting a cookie.
 */
export async function resolveSession(
  db: AdminHandle,
  cookie: string | undefined,
  config: AuthConfiguration
) {
  const reference = await readReference(cookie, config.sessionSecret);
  if (!reference) return undefined;
  return withAdminTransaction(db, async tx => {
    const row = await tx.sessions.reference(reference.id);
    if (!row || !matchesSecret(reference.secret, row.token_hash))
      return undefined;
    const presented = { id: row.id, actorId: row.portal_user_id };
    const identity = await tx.portal_users.lockIdentity(row.portal_user_id);
    if (!identity || identity.status !== 'active' || row.deactivated_at)
      return { presented };
    const tenants = await tx.portal_user_tenants.activeFor(identity.id);
    const tenant = tenants.find(item => item.tenant_id === row.tenant_id);
    if (
      !tenant ||
      row.idle_expires_at.getTime() <= Date.now() ||
      row.absolute_expires_at.getTime() <= Date.now()
    )
      return { presented };
    const context = requestContext.getStore();
    if (context) context.actorId = identity.id;
    const touched = await tx.sessions.extend(row.id, config.idleMinutes);
    if (!touched) {
      if (context) delete context.actorId;
      return { presented };
    }
    return {
      presented,
      session: {
        actorId: identity.id,
        tenantId: tenant.tenant_id,
        entitlements: new Set<string>(),
        permissions: new Set<string>(),
        sessionId: row.id,
        view: sessionView(
          touched,
          identity.id,
          identity.email,
          tenant.tenant_id,
          tenant.tenant_code
        ),
      },
    };
  });
}
