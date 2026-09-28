/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Thrown when a seeded role exists with different grants or identity (M0003-R010). */
export class NapsoftSeedError extends Error {
  /**
   * @param {string} code `SEED_DRIFT` or `SEED_MISSING`.
   */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * The immutable roles seeded into the Napsoft tenant (M0003-R007), with
 * grants sorted the way `RoleGrants.patternsFor` returns them.
 * @param {string} napsoftCode The Napsoft tenant's `tenant_code`.
 * @returns {{code: string, name: string, grants: string[]}[]}
 */
export function napsoftRoles(napsoftCode) {
  return [
    {
      code: 'platform_admin',
      name: 'Platform administrator',
      grants: ['*::*::*::*', `${napsoftCode}::*::*::*`].sort(),
    },
    { code: 'support', name: 'Support', grants: ['*::*::*::read'] },
    {
      code: 'tenant_admin',
      name: 'Tenant administrator',
      grants: [`${napsoftCode}::*::*::*`],
    },
  ];
}

/**
 * Scope the transaction to one tenant for the `app` row-level security rule.
 * `set_config(..., true)` is `SET LOCAL` with a bind parameter.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
export async function setTenant(tx, tenantId) {
  await tx.one("SELECT set_config('nap.tenant_id', $1, true)", [tenantId]);
}

/**
 * Whether a stored role matches its seed definition.
 * @param {object} db Cell repository handle.
 * @param {object} tx
 * @param {object} row Stored role.
 * @param {{grants: string[]}} role Seed definition.
 * @returns {Promise<boolean>}
 */
async function matches(db, tx, row, role) {
  if (!row.is_immutable || row.deactivated_at) return false;
  const stored = await db.role_grants.patternsFor(row.id, { tx });
  return JSON.stringify(stored) === JSON.stringify(role.grants);
}

/**
 * Run the Napsoft seed (M0003-R008, R010) inside the caller's cell
 * transaction: create `platform_admin`, `support`, and `tenant_admin` as
 * immutable roles, and assign `platform_admin` to the bootstrap login.
 *
 * Idempotent by role `code`: a matching role is left unchanged, and a role
 * whose grants or immutability differ fails the seed, since changing an
 * immutable role needs a reviewed migration. Sets `nap.tenant_id` for the
 * transaction first, so the writes pass the row-level security rule.
 * @param {object} db Cell repository handle with `roles`, `role_grants`, and `role_assignments`.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {{tenantId: string, tenantCode: string, portalUserId: string}} napsoft
 * @returns {Promise<{created: string[], assignmentId: string}>} Codes of roles created by this run.
 * @throws {NapsoftSeedError} `SEED_DRIFT`
 */
export async function seedNapsoft(
  db,
  tx,
  { tenantId, tenantCode, portalUserId }
) {
  await setTenant(tx, tenantId);
  const created = [];
  const ids = {};
  for (const role of napsoftRoles(tenantCode)) {
    const existing = await db.roles.lockByCode(tenantId, role.code, { tx });
    if (existing) {
      if (!(await matches(db, tx, existing, role)))
        throw new NapsoftSeedError('SEED_DRIFT');
      ids[role.code] = existing.id;
      continue;
    }
    const row = await db.roles.insert(
      {
        tenant_id: tenantId,
        code: role.code,
        name: role.name,
        is_immutable: true,
      },
      { tx }
    );
    for (const pattern of role.grants)
      await db.role_grants.insert(
        { tenant_id: tenantId, role_id: row.id, pattern },
        { tx }
      );
    ids[role.code] = row.id;
    created.push(role.code);
  }
  const assignment =
    (await db.role_assignments.lockActive(portalUserId, ids.platform_admin, {
      tx,
    })) ??
    (await db.role_assignments.insert(
      {
        tenant_id: tenantId,
        portal_user_id: portalUserId,
        role_id: ids.platform_admin,
      },
      { tx }
    ));
  return { created, assignmentId: assignment.id };
}

/**
 * Read the Napsoft seed back and confirm it is complete and unchanged:
 * every role present, immutable, active, with exactly its grants, and the
 * bootstrap login's active `platform_admin` assignment. Writes nothing.
 * @param {object} db Cell repository handle.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {{tenantId: string, tenantCode: string, portalUserId: string}} napsoft
 * @returns {Promise<boolean>}
 */
export async function napsoftSeedPresent(
  db,
  tx,
  { tenantId, tenantCode, portalUserId }
) {
  await setTenant(tx, tenantId);
  let platformAdmin = null;
  for (const role of napsoftRoles(tenantCode)) {
    const row = await db.roles.lockByCode(tenantId, role.code, { tx });
    if (!row || !(await matches(db, tx, row, role))) return false;
    if (role.code === 'platform_admin') platformAdmin = row;
  }
  const assignment = await db.role_assignments.lockActive(
    portalUserId,
    platformAdmin.id,
    { tx }
  );
  return assignment !== null;
}
