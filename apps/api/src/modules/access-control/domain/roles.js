/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Role, grant, and assignment rules for one tenant (M0003-R011–R015).
 *
 * Every operation takes an access-control context naming the target tenant,
 * its cell, the actor, and how to record a change. Reads and writes of the
 * `app` tables run through `withTenantTransaction`, so the row-level security
 * rule sees the target tenant. A change is recorded as a `cell.outbox` row in
 * the same transaction (R015); the sync worker delivers it to admin, which
 * writes the administrative event and advances the `roles` cache revision
 * only after the change has committed, so no reader can cache the old rows
 * under the new revision.
 */

import { z } from 'zod';
import { withTenantTransaction } from '../../../infrastructure/runtime/tenantTransaction.js';
import { coveredBy, parsePattern, patternInCatalogue } from './patterns.js';
import { AccessControlError, withAccessControlErrors } from './errors.js';

/** Codes of the seeded immutable roles (M0003-R007). A custom role cannot use them (R013). */
export const IMMUTABLE_ROLE_CODES = Object.freeze([
  'platform_admin',
  'support',
  'tenant_admin',
]);

/** Largest grant set one role may carry. */
const MAX_GRANTS = 256;

/**
 * @typedef {object} RoleChange
 * @property {'role.created'|'role.updated'|'role.archived'|'role.restored'|'role.granted'|'role.revoked'} eventKey
 * @property {string} roleId
 * @property {Record<string, string|number|null>} details
 */

/**
 * @typedef {object} AccessControlContext
 * @property {object} cell Target tenant's cell repository handle.
 * @property {{id: string, code: string, isNapsoft: boolean}} tenant Target tenant.
 * @property {string|null} napsoftCode The Napsoft tenant's code, for the tenant `*` rule.
 * @property {string} actorId Acting portal user.
 * @property {() => Promise<string[]>} actorPatterns The actor's resolved patterns (home tenant).
 * @property {{module: string, router: string, action: string}[]} catalogue
 * @property {(change: RoleChange, tx: object) => Promise<void>} record Writes the change's outbox row inside `tx`.
 */

const uuid = z.uuid();
const name = z.string().trim().min(1).max(160);
const description = z.string().trim().max(512).nullable();
const grants = z.array(z.string()).max(MAX_GRANTS);
const revision = z.number().int().positive();

const createSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  name,
  description: description.optional(),
  grants,
});
const updateSchema = z.strictObject({
  name: name.optional(),
  description: description.optional(),
  grants: grants.optional(),
  revision,
});
const revisionSchema = z.strictObject({ revision });

/**
 * Parse `value` with `schema` or report `INVALID_INPUT`.
 * @template T
 * @param {z.ZodType<T>} schema
 * @param {unknown} value
 * @returns {T}
 * @throws {AccessControlError} `INVALID_INPUT`
 */
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new AccessControlError('INVALID_INPUT');
  return result.data;
}

/**
 * Validate a grant set: each a well-formed pattern (R003) whose exact parts
 * are catalogued (R004). Returns the distinct patterns, sorted.
 * @param {string[]} values
 * @param {{module: string, router: string, action: string}[]} catalogue
 * @returns {string[]}
 * @throws {AccessControlError} `INVALID_INPUT`
 */
export function parseGrants(values, catalogue) {
  const distinct = [...new Set(values)].sort();
  for (const pattern of distinct)
    if (!parsePattern(pattern) || !patternInCatalogue(pattern, catalogue))
      throw new AccessControlError('INVALID_INPUT');
  return distinct;
}

/**
 * Require every pattern to be covered by one of the actor's own (R011).
 * @param {AccessControlContext} context
 * @param {string[]} patterns
 * @returns {Promise<void>}
 * @throws {AccessControlError} `GRANT_EXCEEDS_ACTOR`
 */
async function requireCovered(context, patterns) {
  const own = await context.actorPatterns();
  const options = { napsoftCode: context.napsoftCode };
  if (!patterns.every(pattern => coveredBy(own, pattern, options)))
    throw new AccessControlError('GRANT_EXCEEDS_ACTOR');
}

/**
 * Safe projection of a role and its grants.
 * @param {object} row `app.roles` row.
 * @param {string[]} roleGrants
 * @returns {{id: string, code: string, name: string, description: string|null, isImmutable: boolean, archived: boolean, revision: number, grants: string[]}}
 */
export function roleView(row, roleGrants) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    isImmutable: row.is_immutable,
    archived: row.deactivated_at != null,
    revision: row.revision,
    grants: roleGrants,
  };
}

/**
 * JSON snapshot of a role for an event's `before` or `after` (R015).
 * @param {ReturnType<typeof roleView>} view
 * @returns {string}
 */
function snapshot(view) {
  return JSON.stringify({
    name: view.name,
    description: view.description,
    archived: view.archived,
    grants: view.grants,
  });
}

/**
 * Run a cell transaction scoped to the target tenant and record the change it
 * returns, if any, in the same transaction.
 * @template T
 * @param {AccessControlContext} context
 * @param {(tx: object) => Promise<{result: T, change?: RoleChange|null}>} operation
 * @returns {Promise<T>}
 */
async function mutate(context, operation) {
  return withAccessControlErrors(async () => {
    return withTenantTransaction(context.cell, context.tenant.id, async tx => {
      const { result, change } = await operation(tx);
      if (change) await context.record(change, tx);
      return result;
    });
  });
}

/**
 * Lock a role by ID or report `NOT_FOUND`.
 * @param {AccessControlContext} context
 * @param {unknown} id
 * @param {object} tx
 * @returns {Promise<object>}
 * @throws {AccessControlError} `NOT_FOUND`
 */
async function lockRole(context, id, tx) {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) throw new AccessControlError('NOT_FOUND');
  const row = await context.cell.roles.lockById(parsed.data, { tx });
  if (!row) throw new AccessControlError('NOT_FOUND');
  return row;
}

/**
 * The catalogue as the API returns it (M0003 §10 `GET /capabilities`).
 * @param {AccessControlContext} context
 * @returns {{capability: string, module: string, router: string, action: string}[]}
 */
export function listCapabilities(context) {
  return context.catalogue.map(entry => ({ ...entry }));
}

/**
 * The tenant's roles with their grants.
 * @param {AccessControlContext} context
 * @param {{includeArchived?: boolean}} [options]
 * @returns {Promise<ReturnType<typeof roleView>[]>}
 */
export function listRoles(context, { includeArchived = false } = {}) {
  return withAccessControlErrors(() =>
    withTenantTransaction(context.cell, context.tenant.id, async tx => {
      const rows = await context.cell.roles.list({ tx, includeArchived });
      const byRole = await context.cell.role_grants.patternsByRole(
        rows.map(row => row.id),
        { tx }
      );
      return rows.map(row => roleView(row, byRole.get(row.id)));
    })
  );
}

/**
 * One role, archived or not.
 * @param {AccessControlContext} context
 * @param {unknown} id
 * @returns {Promise<ReturnType<typeof roleView>>}
 * @throws {AccessControlError} `NOT_FOUND`
 */
export function getRole(context, id) {
  return withAccessControlErrors(() =>
    withTenantTransaction(context.cell, context.tenant.id, async tx => {
      const parsed = uuid.safeParse(id);
      if (!parsed.success) throw new AccessControlError('NOT_FOUND');
      const row = await context.cell.roles.byId(parsed.data, { tx });
      if (!row) throw new AccessControlError('NOT_FOUND');
      return roleView(
        row,
        await context.cell.role_grants.patternsFor(row.id, { tx })
      );
    })
  );
}

/**
 * Create a custom role (M0003 §8 Create). The code must be new in the
 * tenant, archived roles included, and not an immutable role's code (R013).
 * Every grant must be covered by the actor's patterns (R011).
 * @param {AccessControlContext} context
 * @param {unknown} body `{code, name, description?, grants}`
 * @returns {Promise<ReturnType<typeof roleView>>}
 * @throws {AccessControlError} `INVALID_INPUT`, `CONFLICT`, `GRANT_EXCEEDS_ACTOR`
 */
export async function createRole(context, body) {
  return mutate(context, async tx => {
    const input = parse(createSchema, body);
    const patterns = parseGrants(input.grants, context.catalogue);
    if (IMMUTABLE_ROLE_CODES.includes(input.code))
      throw new AccessControlError('CONFLICT');
    await requireCovered(context, patterns);
    // Serialize creators of the same code; the unique constraint would
    // otherwise surface as a raw database error for the loser.
    await tx.one('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `access-control:role:${context.tenant.id}:${input.code}`,
    ]);
    if (
      await context.cell.roles.lockByCode(context.tenant.id, input.code, { tx })
    )
      throw new AccessControlError('CONFLICT');
    const row = await context.cell.roles.insert(
      {
        tenant_id: context.tenant.id,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        is_immutable: false,
        created_by: context.actorId,
        updated_by: context.actorId,
      },
      { tx }
    );
    await context.cell.role_grants.replaceFor(
      { tenantId: context.tenant.id, roleId: row.id, actorId: context.actorId },
      patterns,
      { tx }
    );
    const view = roleView(row, patterns);
    return {
      result: view,
      change: {
        eventKey: 'role.created',
        roleId: row.id,
        details: {
          role: row.code,
          revision: row.revision,
          after: snapshot(view),
        },
      },
    };
  });
}

/**
 * Edit a custom role's name, description, or grants (M0003 §8 Edit).
 * `grants`, when present, replaces the full set. The actor must cover both
 * the role's current grants and the new ones (R011).
 * @param {AccessControlContext} context
 * @param {unknown} id
 * @param {unknown} body `{name?, description?, grants?, revision}`
 * @returns {Promise<ReturnType<typeof roleView>>}
 * @throws {AccessControlError} `INVALID_INPUT`, `NOT_FOUND`, `ROLE_IMMUTABLE`, `STALE_REVISION`, `GRANT_EXCEEDS_ACTOR`
 */
export async function updateRole(context, id, body) {
  return mutate(context, async tx => {
    const input = parse(updateSchema, body);
    const next =
      input.grants === undefined
        ? undefined
        : parseGrants(input.grants, context.catalogue);
    const row = await lockRole(context, id, tx);
    if (row.is_immutable) throw new AccessControlError('ROLE_IMMUTABLE');
    if (row.revision !== input.revision)
      throw new AccessControlError('STALE_REVISION');
    const current = await context.cell.role_grants.patternsFor(row.id, { tx });
    await requireCovered(context, [...current, ...(next ?? [])]);
    const changes = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.description !== undefined)
      changes.description = input.description;
    const updated = await context.cell.roles.saveRevision(
      row.id,
      changes,
      context.actorId,
      { tx }
    );
    if (next)
      await context.cell.role_grants.replaceFor(
        {
          tenantId: context.tenant.id,
          roleId: row.id,
          actorId: context.actorId,
        },
        next,
        { tx }
      );
    const before = roleView(row, current);
    const after = roleView(updated, next ?? current);
    return {
      result: after,
      change: {
        eventKey: 'role.updated',
        roleId: row.id,
        details: {
          role: row.code,
          revision: updated.revision,
          before: snapshot(before),
          after: snapshot(after),
        },
      },
    };
  });
}

/**
 * Archive or restore a custom role (M0003-R014). Grants and assignments are
 * kept either way; an archived role contributes nothing to a resolved set.
 * Asking for the state the role is already in changes nothing.
 * @param {AccessControlContext} context
 * @param {unknown} id
 * @param {unknown} body `{revision}`
 * @param {boolean} archived Target state.
 * @returns {Promise<ReturnType<typeof roleView>>}
 * @throws {AccessControlError} `INVALID_INPUT`, `NOT_FOUND`, `ROLE_IMMUTABLE`, `STALE_REVISION`
 */
function setArchived(context, id, body, archived) {
  return mutate(context, async tx => {
    const input = parse(revisionSchema, body);
    const row = await lockRole(context, id, tx);
    if (row.is_immutable) throw new AccessControlError('ROLE_IMMUTABLE');
    if (row.revision !== input.revision)
      throw new AccessControlError('STALE_REVISION');
    const current = await context.cell.role_grants.patternsFor(row.id, { tx });
    const before = roleView(row, current);
    if (before.archived === archived) return { result: before, change: null };
    const updated = await context.cell.roles.saveRevision(
      row.id,
      { archived },
      context.actorId,
      { tx }
    );
    const after = roleView(updated, current);
    return {
      result: after,
      change: {
        eventKey: archived ? 'role.archived' : 'role.restored',
        roleId: row.id,
        details: {
          role: row.code,
          revision: updated.revision,
          before: snapshot(before),
          after: snapshot(after),
        },
      },
    };
  });
}

/**
 * Archive a custom role.
 * @param {AccessControlContext} context
 * @param {unknown} id
 * @param {unknown} body `{revision}`
 * @returns {Promise<ReturnType<typeof roleView>>}
 */
export function archiveRole(context, id, body) {
  return setArchived(context, id, body, true);
}

/**
 * Restore an archived custom role.
 * @param {AccessControlContext} context
 * @param {unknown} id
 * @param {unknown} body `{revision}`
 * @returns {Promise<ReturnType<typeof roleView>>}
 */
export function restoreRole(context, id, body) {
  return setArchived(context, id, body, false);
}

/**
 * Validate a user-ID path argument.
 * @param {unknown} value
 * @returns {string}
 * @throws {AccessControlError} `NOT_FOUND`
 */
function parseUserId(value) {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new AccessControlError('NOT_FOUND');
  return parsed.data;
}

/**
 * The roles a user actively holds, read inside `tx`.
 * @param {AccessControlContext} context
 * @param {string} userId
 * @param {object} tx
 * @returns {Promise<{userId: string, roles: ReturnType<typeof roleView>[]}>}
 */
async function assignedRoles(context, userId, tx) {
  const ids = await context.cell.role_assignments.activeRoleIds(userId, {
    tx,
  });
  const byRole = await context.cell.role_grants.patternsByRole(ids, { tx });
  const rows = await Promise.all(
    ids.map(roleId => context.cell.roles.byId(roleId, { tx }))
  );
  const roles = rows
    .filter(Boolean)
    .map(row => roleView(row, byRole.get(row.id)))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { userId, roles };
}

/**
 * The roles a tenant member holds (M0003 §10 `GET /users/:userId/roles`).
 * @param {AccessControlContext} context
 * @param {unknown} userId
 * @returns {Promise<{userId: string, roles: ReturnType<typeof roleView>[]}>}
 * @throws {AccessControlError} `NOT_FOUND` when the user has no membership in the tenant.
 */
export function userRoles(context, userId) {
  return withAccessControlErrors(() =>
    withTenantTransaction(context.cell, context.tenant.id, async tx => {
      const id = parseUserId(userId);
      const status = await context.cell.tenant_members.membershipStatus(
        context.tenant.id,
        id,
        { tx }
      );
      if (!status) throw new AccessControlError('NOT_FOUND');
      return assignedRoles(context, id, tx);
    })
  );
}

/**
 * Assign a role to a tenant member (M0003 §8 Assign). The user must be an
 * active member, the role must be active, and the actor must cover every
 * grant on it (R011). Repeating an assignment returns it unchanged.
 * @param {AccessControlContext} context
 * @param {unknown} userId
 * @param {unknown} roleId
 * @returns {Promise<{userId: string, roles: ReturnType<typeof roleView>[]}>}
 * @throws {AccessControlError} `NOT_FOUND`, `NOT_MEMBER`, `INVALID_STATE`, `GRANT_EXCEEDS_ACTOR`
 */
export function assignRole(context, userId, roleId) {
  return mutate(context, async tx => {
    const id = parseUserId(userId);
    const role = await lockRole(context, roleId, tx);
    if (role.deactivated_at) throw new AccessControlError('INVALID_STATE');
    const status = await context.cell.tenant_members.membershipStatus(
      context.tenant.id,
      id,
      { tx }
    );
    if (status !== 'active') throw new AccessControlError('NOT_MEMBER');
    await requireCovered(
      context,
      await context.cell.role_grants.patternsFor(role.id, { tx })
    );
    const existing = await context.cell.role_assignments.lockActive(
      id,
      role.id,
      { tx }
    );
    if (!existing)
      await context.cell.role_assignments.insert(
        {
          tenant_id: context.tenant.id,
          portal_user_id: id,
          role_id: role.id,
          created_by: context.actorId,
          updated_by: context.actorId,
        },
        { tx }
      );
    return {
      result: await assignedRoles(context, id, tx),
      change: existing
        ? null
        : {
            eventKey: 'role.granted',
            roleId: role.id,
            details: {
              role: role.code,
              portal_user_id: id,
              from_status: 'unassigned',
              to_status: 'assigned',
            },
          },
    };
  });
}

/**
 * Whether removing one assignment of `role` in `tenant` would leave the
 * tenant without an administrator (R012): the last `tenant_admin` in any
 * tenant, or the last `platform_admin` in the Napsoft tenant.
 * @param {{code: string, is_immutable: boolean}} role
 * @param {{isNapsoft: boolean}} tenant
 * @returns {boolean} Whether the role is guarded.
 */
export function isGuardedAdminRole(role, tenant) {
  if (!role.is_immutable) return false;
  if (role.code === 'tenant_admin') return true;
  return role.code === 'platform_admin' && tenant.isNapsoft;
}

/**
 * Remove a role from a user (M0003 §8 Remove). The actor must cover every
 * grant on the role (R011), and the last administrator assignment cannot be
 * removed (R012). Only assignments of active members count, so removing an
 * inactive member's assignment is never blocked. The role row is locked
 * first, so two removals of the same role serialize and the count each sees
 * is current.
 * @param {AccessControlContext} context
 * @param {unknown} userId
 * @param {unknown} roleId
 * @returns {Promise<{userId: string, roles: ReturnType<typeof roleView>[]}>}
 * @throws {AccessControlError} `NOT_FOUND`, `GRANT_EXCEEDS_ACTOR`, `LAST_ADMIN`
 */
export function removeRole(context, userId, roleId) {
  return mutate(context, async tx => {
    const id = parseUserId(userId);
    const role = await lockRole(context, roleId, tx);
    const assignment = await context.cell.role_assignments.lockActive(
      id,
      role.id,
      { tx }
    );
    if (!assignment) throw new AccessControlError('NOT_FOUND');
    await requireCovered(
      context,
      await context.cell.role_grants.patternsFor(role.id, { tx })
    );
    if (
      isGuardedAdminRole(role, context.tenant) &&
      (await context.cell.tenant_members.membershipStatus(
        context.tenant.id,
        id,
        { tx }
      )) === 'active' &&
      (await context.cell.role_assignments.countActive(
        role.id,
        context.tenant.id,
        { tx }
      )) <= 1
    )
      throw new AccessControlError('LAST_ADMIN');
    await context.cell.role_assignments.archive(
      assignment.id,
      context.actorId,
      {
        tx,
      }
    );
    return {
      result: await assignedRoles(context, id, tx),
      change: {
        eventKey: 'role.revoked',
        roleId: role.id,
        details: {
          role: role.code,
          portal_user_id: id,
          from_status: 'assigned',
          to_status: 'unassigned',
        },
      },
    };
  });
}
