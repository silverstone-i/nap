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
import { platformGrants } from './platform.js';
import type {
  AdminHandle,
  AdminRepositories,
} from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
import type { AuthConfiguration } from '../util/authConfig.js';
import type { SessionView } from '@nap/shared';

/** Does: Builds the public identity and expiry view. Called by: session creation and resolution. */
export function sessionView(
  row: { idle_expires_at: Date; absolute_expires_at: Date },
  actorId: string,
  email: string,
  tenantId: string | null,
  tenantCode: string | null
): SessionView {
  return {
    actorId,
    email,
    tenantId,
    tenantCode,
    expiresAt: new Date(
      Math.min(row.idle_expires_at.getTime(), row.absolute_expires_at.getTime())
    ).toISOString(),
    state: tenantId ? 'tenant-selected' : 'tenant-selection-required',
    platformPermissions: [],
    controlledAccess: null,
  };
}
/** Does: Creates a signed opaque session reference. Called by: successful credential verification. */
export async function createSession(
  tx: AdminTransaction<AdminRepositories>,
  config: AuthConfiguration,
  identity: { id: string; email: string; must_change_password?: boolean },
  tenant?: { tenant_id: string; tenant_code: string }
) {
  const secret = sessionSecret();
  const now = new Date();
  const absolute = new Date(now.getTime() + config.absoluteHours * 3600000);
  const row = await tx.sessions.insert({
    portal_user_id: identity.id,
    tenant_id: tenant?.tenant_id ?? null,
    token_hash: secretDigest(secret),
    last_seen_at: now,
    absolute_expires_at: absolute,
    idle_expires_at: new Date(
      Math.min(absolute.getTime(), now.getTime() + config.idleMinutes * 60000)
    ),
  });
  const view = sessionView(
    row,
    identity.id,
    identity.email,
    tenant?.tenant_id ?? null,
    tenant?.tenant_code ?? null
  );
  view.platformPermissions = await platformGrants(tx, identity.id);
  if (identity.must_change_password) {
    view.state = 'password-change-required';
    view.tenantId = null;
    view.tenantCode = null;
  }
  return {
    cookie: await signReference(row.id, secret, config.sessionSecret),
    view,
  };
}
/** Does: Rechecks the current operator, effective identity, membership, cell and grant. Called by: middleware on each signed request. */
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
    if (
      !identity ||
      identity.status !== 'active' ||
      row.deactivated_at ||
      row.idle_expires_at.getTime() <= Date.now() ||
      row.absolute_expires_at.getTime() <= Date.now()
    )
      return { presented };
    const grants = await platformGrants(tx, identity.id);
    let effective = identity;
    let linked: string | undefined;
    let kind: string | undefined;
    let selected: Awaited<ReturnType<typeof tx.cells.assignment>> = null;
    if (row.tenant_id && !identity.must_change_password) {
      selected = await tx.cells.assignment(row.tenant_id);
      if (!selected || selected.status !== 'active') return { presented };
      if (row.access_mode) {
        const permission =
          row.access_mode === 'impersonation' ? 'impersonate' : 'access';
        if (
          !grants.includes(`admin-tenancy::control::${permission}`) ||
          !row.access_reason ||
          !selected.provisioned ||
          !selected.enabled ||
          selected.code !== config.cellCode
        )
          return { presented };
        if (row.access_mode === 'impersonation') {
          const target = row.effective_user_id
            ? await tx.portal_users.lockIdentity(row.effective_user_id)
            : null;
          if (
            !target ||
            target.is_root ||
            target.status !== 'active' ||
            target.must_change_password
          )
            return { presented };
          effective = target;
        }
      }
      if (!row.access_mode || row.access_mode === 'impersonation') {
        const membership = (
          await tx.portal_user_tenants.activeFor(effective.id)
        ).find(m => m.tenant_id === row.tenant_id);
        if (!membership) return { presented };
        linked = membership.entity_id ?? undefined;
        kind = membership.user_type ?? undefined;
      }
      // Root can administer before explicit reconciliation, but cannot read cell data.
      if (
        (!selected.provisioned ||
          !selected.enabled ||
          selected.code !== config.cellCode) &&
        !identity.is_root
      )
        return { presented };
    }
    const context = requestContext.getStore();
    if (context) context.actorId = identity.id;
    let touched;
    try {
      touched = await tx.sessions.extend(row.id, config.idleMinutes);
    } finally {
      // Extension needs an audit actor, but a rejected or failed lookup must not retain it.
      if (context) delete context.actorId;
    }
    if (!touched) return { presented };
    if (context) context.actorId = identity.id;
    const usable =
      selected?.provisioned &&
      selected.enabled &&
      selected.code === config.cellCode;
    const view = sessionView(
      touched,
      effective.id,
      effective.email,
      selected?.id ?? null,
      selected?.tenant_code ?? null
    );
    view.platformPermissions =
      row.access_mode === 'impersonation' ? [] : grants;
    if (identity.must_change_password) view.state = 'password-change-required';
    if (row.access_mode)
      view.controlledAccess = {
        mode: row.access_mode === 'impersonation' ? 'impersonation' : 'access',
        operatorId: identity.id,
        reason: row.access_reason!,
      };
    return {
      presented,
      session: {
        actorId: effective.id,
        operatorId: identity.id,
        tenantId: usable ? selected?.id : undefined,
        entityId: linked,
        userType: kind,
        platformPermissions: new Set(view.platformPermissions),
        entitlements: new Set<string>(usable ? ['core'] : []),
        permissions: new Set<string>(usable ? ['core::identity::profile'] : []),
        sessionId: row.id,
        view,
      },
    };
  });
}
/** Does: Rotates a session's secret without extending absolute lifetime. Called by: selection and controlled access transitions. */
export async function rotateSession(
  tx: AdminTransaction<AdminRepositories>,
  id: string,
  config: AuthConfiguration
) {
  const secret = sessionSecret();
  await tx.sessions.update(id, { token_hash: secretDigest(secret) });
  return signReference(id, secret, config.sessionSecret);
}
