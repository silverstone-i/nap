/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AdminBootstrapError, withBootstrapErrors } from './errors.js';
import { hashPassword, parsePassword } from './password.js';

/**
 * Stable codes recorded on a failed `bootstrap.failed` event and returned as
 * `AdminBootstrapError.code`. M0001-02-R004: each names the record whose
 * configured identity conflicts with what is already stored.
 */
export const CONFLICT_CODES = Object.freeze({
  tenant: 'TENANT_CONFLICT',
  root: 'ROOT_CONFLICT',
  membership: 'MEMBERSHIP_CONFLICT',
});

/** Advisory lock key serializing concurrent bootstrap attempts, namespaced away from other advisory-lock users (`hashtext` on the database name in `postgres.js`). */
const LOCK_KEY = "hashtext('admin-tenancy:bootstrap')";

const configSchema = z.strictObject({
  tenantCode: z.string().min(1).max(32),
  tenantName: z.string().min(1).max(160),
  rootEmail: z.string().min(1).max(254),
  rootPassword: z.string(),
  hashingPolicy: z.object({
    memoryKib: z.number(),
    timeCost: z.number(),
    parallelism: z.number(),
  }),
});

/**
 * Validate bootstrap's configured identity: the owning tenant's code and
 * name, the root email, and the initial password's length. The root email
 * is normalized (trimmed, lowercased) the way every stored email is.
 * @param {unknown} config
 * @returns {{tenantCode: string, tenantName: string, rootEmail: string, rootPassword: string, hashingPolicy: import('./password.js').HashingPolicy}}
 * @throws {AdminBootstrapError} `INVALID_INPUT`
 */
function parseBootstrapConfig(config) {
  const result = configSchema.safeParse(config);
  if (!result.success) throw new AdminBootstrapError('INVALID_INPUT');
  const parsed = result.data;
  let rootPassword;
  try {
    rootPassword = parsePassword(parsed.rootPassword);
  } catch {
    throw new AdminBootstrapError('INVALID_INPUT');
  }
  return {
    tenantCode: parsed.tenantCode,
    tenantName: parsed.tenantName,
    rootEmail: parsed.rootEmail.trim().toLowerCase(),
    rootPassword,
    hashingPolicy: parsed.hashingPolicy,
  };
}

/**
 * Create or verify the owning tenant inside the bootstrap transaction.
 * @param {object} db
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {{tenantCode: string, tenantName: string}} config
 * @returns {Promise<{row: object, created: boolean}>}
 * @throws {AdminBootstrapError} `TENANT_CONFLICT`
 */
async function resolveTenant(db, tx, { tenantCode, tenantName }) {
  const existing = await db.tenants.lockNapsoft({ tx });
  if (existing) {
    if (existing.tenant_code.toLowerCase() !== tenantCode.toLowerCase())
      throw new AdminBootstrapError(CONFLICT_CODES.tenant);
    return { row: existing, created: false };
  }
  const taken = await db.tenants.lockActiveByCode(tenantCode, { tx });
  if (taken) throw new AdminBootstrapError(CONFLICT_CODES.tenant);
  const row = await db.tenants.insert(
    {
      tenant_code: tenantCode,
      name: tenantName,
      is_napsoft: true,
      status: 'active',
    },
    { tx }
  );
  return { row, created: true };
}

/**
 * Create or verify the root portal user inside the bootstrap transaction.
 *
 * A repeat run never rewrites the stored password hash, even when the
 * configured password has since changed: M0001-02-R003 preserves it, and
 * rerunning bootstrap is never password recovery. The root account does not
 * require a password change on first login: `is_root` alone grants it
 * `platform_admin` capabilities (M0001-05-R005), so there is no restricted
 * session to clear.
 * @param {object} db
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {{rootEmail: string, rootPassword: string, hashingPolicy: import('./password.js').HashingPolicy}} config
 * @returns {Promise<{row: object, created: boolean}>}
 * @throws {AdminBootstrapError} `ROOT_CONFLICT`
 */
async function resolveRootUser(
  db,
  tx,
  { rootEmail, rootPassword, hashingPolicy }
) {
  const existing = await db.portal_users.lockRoot({ tx });
  if (existing) {
    if (existing.email.toLowerCase() !== rootEmail)
      throw new AdminBootstrapError(CONFLICT_CODES.root);
    return { row: existing, created: false };
  }
  const taken = await db.portal_users.lockActiveByEmail(rootEmail, { tx });
  if (taken) throw new AdminBootstrapError(CONFLICT_CODES.root);
  const passwordHash = await hashPassword(hashingPolicy, rootPassword);
  const row = await db.portal_users.insertRoot(
    { email: rootEmail, passwordHash },
    { tx }
  );
  return { row, created: true };
}

/**
 * Create or verify the root membership inside the bootstrap transaction.
 *
 * A null `member_type` is only valid for this exact root-user/napsoft-tenant
 * pair (the `protect_membership` trigger enforces it), so no extra check is
 * needed beyond the row's existence.
 * @param {object} db
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {string} tenantId
 * @param {string} portalUserId
 * @returns {Promise<{row: object, created: boolean}>}
 * @throws {AdminBootstrapError} `MEMBERSHIP_CONFLICT`
 */
async function resolveMembership(db, tx, tenantId, portalUserId) {
  const existing = await db.portal_user_tenants.lockByUserAndTenant(
    portalUserId,
    tenantId,
    { tx }
  );
  if (existing) {
    if (existing.member_type !== null)
      throw new AdminBootstrapError(CONFLICT_CODES.membership);
    return { row: existing, created: false };
  }
  const row = await db.portal_user_tenants.insert(
    {
      portal_user_id: portalUserId,
      tenant_id: tenantId,
      member_type: null,
      status: 'active',
      member_id: null,
      ready: true,
    },
    { tx }
  );
  return { row, created: true };
}

/**
 * Append a bootstrap event, generating its deduplication key.
 * @param {object} db
 * @param {object} event
 * @param {{tx?: import('pg-promise').IDatabase<unknown>}} [options]
 * @returns {Promise<void>}
 */
async function appendBootstrapEvent(db, event, options = {}) {
  await db.managed_events.append(
    { deduplication_key: randomUUID(), ...event },
    options
  );
}

/**
 * Create or verify the owning tenant, root portal user, and root membership.
 * M0001-02-R001 through R004.
 *
 * Runs entirely under one transaction-scoped advisory lock and one
 * transaction (M0001-02-R005), so concurrent bootstrap attempts serialize
 * rather than race; the second attempt observes the first's committed rows
 * and reports the same result. Bootstrap does not create a role assignment:
 * root authority comes from `is_root = true` alone, resolved by M0001-05 at
 * authorization time, independent of cell provisioning or role seeding
 * (M0001-02-R002).
 * @param {object} db Admin database handle with `tenants`, `portal_users`, `portal_user_tenants`, `managed_events`, and `tx`.
 * @param {unknown} config `{tenantCode, tenantName, rootEmail, rootPassword, hashingPolicy}`.
 * @returns {Promise<{status: 'created'|'existing', tenant: object, rootUser: object, membership: object}|{status: 'conflict', code: string}>}
 * @throws {AdminBootstrapError} `INVALID_INPUT`, `AUDIT_UNAVAILABLE`, or `INTERNAL_ERROR`
 */
export async function bootstrapRoot(db, config) {
  const parsed = parseBootstrapConfig(config);
  const requestId = randomUUID();
  return withBootstrapErrors(async () => {
    try {
      return await db.tx(async tx => {
        await tx.one(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
        const tenant = await resolveTenant(db, tx, parsed);
        const rootUser = await resolveRootUser(db, tx, parsed);
        const membership = await resolveMembership(
          db,
          tx,
          tenant.row.id,
          rootUser.row.id
        );
        const created =
          tenant.created || rootUser.created || membership.created;
        // A pure verify-only run — everything already matched the
        // configuration — writes no event. Logging "succeeded" on every
        // repeat invocation would make a health-check-style rerun grow the
        // append-only event table without recording anything new.
        if (created)
          await appendBootstrapEvent(
            db,
            {
              event_key: 'bootstrap.succeeded',
              outcome: 'succeeded',
              request_id: requestId,
              target_type: 'tenant',
              target_id: tenant.row.id,
            },
            { tx }
          );
        return {
          status: created ? 'created' : 'existing',
          tenant: tenant.row,
          rootUser: rootUser.row,
          membership: membership.row,
        };
      });
    } catch (error) {
      if (
        error instanceof AdminBootstrapError &&
        Object.values(CONFLICT_CODES).includes(error.code)
      ) {
        await appendBootstrapEvent(db, {
          event_key: 'bootstrap.failed',
          outcome: 'failed',
          request_id: requestId,
          details: { code: error.code },
        });
        return { status: 'conflict', code: error.code };
      }
      throw error;
    }
  });
}
