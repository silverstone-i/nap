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
import {
  AccessControlBulkFailedError,
  AccessControlError,
  accessControlCode,
  withAccessControlErrors,
} from './errors.js';

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
 * @property {'role.created'|'role.updated'|'role.archived'|'role.restored'|'role.granted'|'role.revoked'|'role.held'|'role.released'} eventKey
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
 * The list's raw query: `archived` is `'true'` or `'false'`. Strict, so the
 * old `includeArchived` is refused (I0011-R009).
 */
const listQuerySchema = z.strictObject({
  archived: z.enum(['true', 'false']).optional(),
});

/**
 * The tenant's active roles with their grants, or only its archived ones
 * when `archived` is `'true'` (I0011-R009).
 * @param {AccessControlContext} context
 * @param {unknown} [query] Raw query values, checked by `listQuerySchema`.
 * @returns {Promise<ReturnType<typeof roleView>[]>}
 * @throws {AccessControlError} `INVALID_INPUT`
 */
export async function listRoles(context, query = {}) {
  const archived = parse(listQuerySchema, query).archived === 'true';
  return withAccessControlErrors(() =>
    withTenantTransaction(context.cell, context.tenant.id, async tx => {
      const rows = await context.cell.roles.list({ tx, archived });
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
    const holder = await context.cell.roles.lockByCode(
      context.tenant.id,
      input.code,
      { tx }
    );
    if (holder)
      throw new AccessControlError(
        'CONFLICT',
        holder.deactivated_at ? { id: holder.id, archived: true } : undefined
      );
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
 * Archive or restore a custom role inside `tx` (M0003-R014). Grants and
 * assignments are kept either way; an archived role contributes nothing to
 * a resolved set. Asking for the state the role is already in changes
 * nothing, unless `strict`, which refuses it with `INVALID_STATE` (R018).
 * @param {AccessControlContext} context
 * @param {object} tx
 * @param {unknown} id
 * @param {number} expected The caller's revision.
 * @param {boolean} archived Target state.
 * @param {{strict?: boolean}} [options]
 * @returns {Promise<{result: ReturnType<typeof roleView>, change: RoleChange|null}>}
 * @throws {AccessControlError} `NOT_FOUND`, `ROLE_IMMUTABLE`, `STALE_REVISION`, `INVALID_STATE`
 */
async function applyArchived(
  context,
  tx,
  id,
  expected,
  archived,
  { strict = false } = {}
) {
  const row = await lockRole(context, id, tx);
  if (row.is_immutable) throw new AccessControlError('ROLE_IMMUTABLE');
  if (row.revision !== expected) throw new AccessControlError('STALE_REVISION');
  const current = await context.cell.role_grants.patternsFor(row.id, { tx });
  const before = roleView(row, current);
  if (before.archived === archived) {
    if (strict) throw new AccessControlError('INVALID_STATE');
    return { result: before, change: null };
  }
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
}

/**
 * Archive or restore one custom role in its own transaction.
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
    return applyArchived(context, tx, id, input.revision, archived);
  });
}

const bulkSchema = z.strictObject({
  items: z
    .array(z.strictObject({ id: uuid, revision }))
    .min(1)
    .max(100),
});

/**
 * Archive or restore several custom roles in one cell transaction
 * (M0003-R018). Each role runs in a savepoint so its failure is recorded
 * against it alone; if any failed, nothing changes and the caller gets
 * `BULK_FAILED` naming each failed role and its code, in request order.
 * Roles are locked in ID order, so two bulk requests cannot deadlock.
 * @param {AccessControlContext} context
 * @param {unknown} body `{ items: [{ id, revision }] }`, 1 to 100 distinct IDs.
 * @param {boolean} archived Target state.
 * @returns {Promise<{rows: ReturnType<typeof roleView>[]}>}
 * @throws {AccessControlError} `INVALID_INPUT`, `BULK_FAILED`
 */
function setArchivedMany(context, body, archived) {
  return withAccessControlErrors(async () => {
    const { items } = parse(bulkSchema, body);
    if (new Set(items.map(item => item.id)).size !== items.length)
      throw new AccessControlError('INVALID_INPUT');
    const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id));
    return withTenantTransaction(context.cell, context.tenant.id, async tx => {
      const done = new Map();
      const failed = [];
      for (const item of ordered) {
        try {
          done.set(
            item.id,
            await tx.tx(savepoint =>
              applyArchived(
                context,
                savepoint,
                item.id,
                item.revision,
                archived,
                { strict: true }
              )
            )
          );
        } catch (error) {
          failed.push({ id: item.id, code: accessControlCode(error) });
        }
      }
      if (failed.length) {
        const order = new Map(items.map((item, index) => [item.id, index]));
        failed.sort((a, b) => order.get(a.id) - order.get(b.id));
        throw new AccessControlBulkFailedError(failed);
      }
      for (const item of items)
        await context.record(done.get(item.id).change, tx);
      return { rows: items.map(item => done.get(item.id).result) };
    });
  });
}

/**
 * Archive several custom roles at once, all or nothing (M0003-R018).
 * @param {AccessControlContext} context
 * @param {unknown} body `{ items: [{ id, revision }] }`
 * @returns {Promise<{rows: ReturnType<typeof roleView>[]}>}
 */
export function archiveRoles(context, body) {
  return setArchivedMany(context, body, true);
}

/**
 * Restore several archived custom roles at once, all or nothing (M0003-R018).
 * @param {AccessControlContext} context
 * @param {unknown} body `{ items: [{ id, revision }] }`
 * @returns {Promise<{rows: ReturnType<typeof roleView>[]}>}
 */
export function restoreRoles(context, body) {
  return setArchivedMany(context, body, false);
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
 * Validate a membership-ID path argument.
 * @param {unknown} value
 * @returns {string}
 * @throws {AccessControlError} `NOT_FOUND`
 */
function parseMembershipId(value) {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new AccessControlError('NOT_FOUND');
  return parsed.data;
}

/**
 * The roles a membership actively holds, read inside `tx`.
 * @param {AccessControlContext} context
 * @param {string} membershipId
 * @param {object} tx
 * @returns {Promise<{membershipId: string, roles: ReturnType<typeof roleView>[]}>}
 */
async function assignedRoles(context, membershipId, tx) {
  const ids = await context.cell.role_assignments.activeRoleIds(membershipId, {
    tx,
  });
  const byRole = await context.cell.role_grants.patternsByRole(ids, { tx });
  const rows = await context.cell.roles.byIds(ids, { tx });
  const roles = rows
    .map(row => roleView(row, byRole.get(row.id)))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { membershipId, roles };
}

/**
 * The tenant's pending and active memberships, each with the person's name
 * when it has a party, for choosing whose roles to change (I0012-R017).
 * @param {AccessControlContext} context
 * @returns {Promise<{id: string, memberType: string|null, label: string|null, name: string|null, status: string}[]>}
 */
export function listMemberships(context) {
  return withAccessControlErrors(() =>
    withTenantTransaction(context.cell, context.tenant.id, async tx => {
      const members = await context.cell.tenant_members.byStatus(
        context.tenant.id,
        ['pending', 'active'],
        { tx }
      );
      const partyIds = members.map(row => row.member_id).filter(Boolean);
      // In the tenant transaction, so row-level security returns the rows.
      const people = await context.cell.people.byKeys(partyIds, { tx });
      const names = new Map(
        people.map(row => [row.party_id, `${row.first_name} ${row.last_name}`])
      );
      return members
        .map(row => ({
          id: row.id,
          memberType: row.member_type,
          label: row.member_label,
          name: names.get(row.member_id) ?? null,
          status: row.status,
        }))
        .sort(
          (a, b) =>
            (a.name ?? '').localeCompare(b.name ?? '') ||
            (a.label ?? '').localeCompare(b.label ?? '')
        );
    })
  );
}

/**
 * The roles a tenant membership holds (M0003 §10, I0012-R013
 * `GET /memberships/:membershipId/roles`).
 * @param {AccessControlContext} context
 * @param {unknown} membershipId
 * @returns {Promise<{membershipId: string, roles: ReturnType<typeof roleView>[]}>}
 * @throws {AccessControlError} `NOT_FOUND` when the tenant has no such membership.
 */
export function membershipRoles(context, membershipId) {
  return withAccessControlErrors(() =>
    withTenantTransaction(context.cell, context.tenant.id, async tx => {
      const id = parseMembershipId(membershipId);
      const member = await context.cell.tenant_members.byId(
        context.tenant.id,
        id,
        { tx }
      );
      if (!member) throw new AccessControlError('NOT_FOUND');
      return assignedRoles(context, id, tx);
    })
  );
}

/**
 * Assign a role to a tenant membership (M0003 §8 Assign). The membership
 * must be active, the role must be active, and the actor must cover every
 * grant on it (R011). Repeating an assignment returns it unchanged.
 * @param {AccessControlContext} context
 * @param {unknown} membershipId
 * @param {unknown} roleId
 * @returns {Promise<{membershipId: string, roles: ReturnType<typeof roleView>[]}>}
 * @throws {AccessControlError} `NOT_FOUND`, `NOT_MEMBER`, `INVALID_STATE`, `GRANT_EXCEEDS_ACTOR`
 */
export function assignRole(context, membershipId, roleId) {
  return mutate(context, async tx => {
    const id = parseMembershipId(membershipId);
    const role = await lockRole(context, roleId, tx);
    if (role.deactivated_at) throw new AccessControlError('INVALID_STATE');
    const member = await context.cell.tenant_members.byId(
      context.tenant.id,
      id,
      { tx }
    );
    if (member?.status !== 'active') throw new AccessControlError('NOT_MEMBER');
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
          membership_id: id,
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
              portal_user_id: member.portal_user_id,
              membership_id: id,
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
 * Remove a role from a membership (M0003 §8 Remove). The actor must cover every
 * grant on the role (R011), and the last administrator assignment cannot be
 * removed (R012). Only assignments of active members count, so removing an
 * inactive member's assignment is never blocked. The role row is locked
 * first, so two removals of the same role serialize and the count each sees
 * is current.
 * @param {AccessControlContext} context
 * @param {unknown} membershipId
 * @param {unknown} roleId
 * @returns {Promise<{membershipId: string, roles: ReturnType<typeof roleView>[]}>}
 * @throws {AccessControlError} `NOT_FOUND`, `GRANT_EXCEEDS_ACTOR`, `LAST_ADMIN`, `ROOT_IMMUTABLE`
 */
export function removeRole(context, membershipId, roleId) {
  return mutate(context, async tx => {
    const id = parseMembershipId(membershipId);
    const role = await lockRole(context, roleId, tx);
    const assignment = await context.cell.role_assignments.lockActive(
      id,
      role.id,
      { tx }
    );
    if (!assignment) throw new AccessControlError('NOT_FOUND');
    const member = await context.cell.tenant_members.byId(
      context.tenant.id,
      id,
      { tx }
    );
    if (
      role.code === 'platform_admin' &&
      context.tenant.isNapsoft &&
      member?.portal_user_id === context.bootstrapUserId
    )
      throw new AccessControlError('ROOT_IMMUTABLE');
    await requireCovered(
      context,
      await context.cell.role_grants.patternsFor(role.id, { tx })
    );
    if (
      isGuardedAdminRole(role, context.tenant) &&
      member?.status === 'active' &&
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
          portal_user_id: member?.portal_user_id ?? null,
          membership_id: id,
          from_status: 'assigned',
          to_status: 'unassigned',
        },
      },
    };
  });
}
