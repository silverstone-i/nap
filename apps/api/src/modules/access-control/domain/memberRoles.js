/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file A directory person's roles, chosen when portal access is turned on
 * and changed by editing the person (I0010). A person who is an active member
 * holds assignments in `app.role_assignments`, keyed by their login. Anyone
 * else holds the chosen roles in `app.held_roles`, keyed by their party ID,
 * until the membership copy arrives active and `applyHeldRoles` assigns
 * them. Every function runs inside the caller's tenant-scoped cell
 * transaction, so the person save, the roles, and the portal-access request
 * commit together (I0010 §7).
 */

import { randomUUID } from 'node:crypto';
import { setTenant } from '../../../infrastructure/runtime/tenantTransaction.js';
import { coveredBy } from './patterns.js';
import { AccessControlError } from './errors.js';
import { isGuardedAdminRole } from './roles.js';

/**
 * @typedef {object} MemberRolesContext
 * @property {object} cell Target tenant's cell repository handle.
 * @property {{id: string, isNapsoft?: boolean}} tenant Target tenant.
 * @property {string|null} napsoftCode
 * @property {string} actorId
 * @property {() => Promise<string[]>} actorPatterns The actor's own grants.
 * @property {(change: import('./roles.js').RoleChange, tx: object) => Promise<void>} record Writes a `role_change` outbox row.
 */

/** Membership statuses, best first: a person's most useful login wins. */
const MEMBERSHIP_RANK = { active: 0, pending: 1, suspended: 2 };

/**
 * The person's login in this tenant, if a membership copy exists.
 * @param {MemberRolesContext} context
 * @param {string} partyId
 * @param {object} tx
 * @returns {Promise<{portal_user_id: string, status: string}|null>}
 */
async function loginOf(context, partyId, tx) {
  const rows = await context.cell.tenant_members.byMemberIds(
    context.tenant.id,
    [partyId],
    { tx }
  );
  rows.sort((a, b) => MEMBERSHIP_RANK[a.status] - MEMBERSHIP_RANK[b.status]);
  return rows[0] ?? null;
}

/**
 * A person's current roles (I0010-R003): held roles while any are held,
 * otherwise the login's assignments, including roles kept while access is
 * off (R010).
 * @param {MemberRolesContext} context
 * @param {string} partyId
 * @param {object} tx
 * @returns {Promise<{held: boolean, roleIds: string[], login: {portal_user_id: string, status: string}|null}>}
 */
export async function memberRoles(context, partyId, tx) {
  const login = await loginOf(context, partyId, tx);
  const held = await context.cell.held_roles.activeFor([partyId], { tx });
  if (held.length > 0 && login?.status !== 'active')
    return { held: true, roleIds: held.map(row => row.role_id), login };
  const roleIds = login
    ? await context.cell.role_assignments.activeRoleIds(login.portal_user_id, {
        tx,
      })
    : [];
  return { held: false, roleIds, login };
}

/**
 * The roles a person holds, as the detail response shows them
 * (`[{id, code, name, held}]`, I0010 §10), sorted by code.
 * @param {MemberRolesContext} context
 * @param {string} partyId
 * @param {object} tx
 * @returns {Promise<{id: string, code: string, name: string, held: boolean}[]>}
 */
export async function memberRoleViews(context, partyId, tx) {
  const { held, roleIds } = await memberRoles(context, partyId, tx);
  const rows = await context.cell.roles.byIds(roleIds, { tx });
  return rows
    .map(row => ({ id: row.id, code: row.code, name: row.name, held }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Require the actor to cover every grant of `role` (M0003-R011).
 * @param {MemberRolesContext} context
 * @param {{id: string}} role
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {AccessControlError} `GRANT_EXCEEDS_ACTOR`
 */
async function requireCovered(context, role, tx) {
  const own = await context.actorPatterns();
  const patterns = await context.cell.role_grants.patternsFor(role.id, { tx });
  const options = { napsoftCode: context.napsoftCode };
  if (!patterns.every(pattern => coveredBy(own, pattern, options)))
    throw new AccessControlError('GRANT_EXCEEDS_ACTOR');
}

/**
 * Set a person's roles to exactly `roleIds` (I0010-R006, R009). For an
 * active member this adds and removes assignments under M0003's rules; for
 * anyone else it replaces the held roles. An added role must be an
 * unarchived role of the tenant the actor covers; a removed one must be
 * covered too, and the tenant's last administrator assignment cannot be
 * removed (M0003-R012). Nothing is written when a rule fails.
 * @param {MemberRolesContext} context
 * @param {string} partyId
 * @param {string[]} roleIds One or more distinct role UUIDs.
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {AccessControlError} `INVALID_INPUT`, `NOT_FOUND`, `GRANT_EXCEEDS_ACTOR`, `LAST_ADMIN`
 */
export async function setMemberRoles(context, partyId, roleIds, tx) {
  const wanted = [...new Set(roleIds)];
  if (wanted.length === 0 || wanted.length !== roleIds.length)
    throw new AccessControlError('INVALID_INPUT');
  const current = await memberRoles(context, partyId, tx);
  const added = wanted.filter(id => !current.roleIds.includes(id));
  const dropped = current.roleIds.filter(id => !wanted.includes(id));
  const roles = new Map();
  for (const id of [...added, ...dropped]) {
    const role = await context.cell.roles.lockById(id, { tx });
    if (!role) throw new AccessControlError('NOT_FOUND');
    roles.set(id, role);
  }
  for (const id of added) {
    if (roles.get(id).deactivated_at)
      throw new AccessControlError('INVALID_STATE');
    await requireCovered(context, roles.get(id), tx);
  }
  for (const id of dropped) await requireCovered(context, roles.get(id), tx);

  const active = current.login?.status === 'active';
  if (active) {
    const userId = current.login.portal_user_id;
    for (const id of dropped) {
      const role = roles.get(id);
      if (
        isGuardedAdminRole(role, context.tenant) &&
        (await context.cell.role_assignments.countActive(
          role.id,
          context.tenant.id,
          { tx }
        )) <= 1
      )
        throw new AccessControlError('LAST_ADMIN');
      const assignment = await context.cell.role_assignments.lockActive(
        userId,
        role.id,
        { tx }
      );
      await context.cell.role_assignments.archive(
        assignment.id,
        context.actorId,
        { tx }
      );
      await context.record(assignmentChange(role, userId, false), tx);
    }
    for (const id of added) {
      await context.cell.role_assignments.insert(
        {
          tenant_id: context.tenant.id,
          portal_user_id: userId,
          role_id: id,
          created_by: context.actorId,
          updated_by: context.actorId,
        },
        { tx }
      );
      await context.record(assignmentChange(roles.get(id), userId, true), tx);
    }
    return;
  }

  // Not an active member: the wanted set becomes the held set, even when the
  // login keeps assignments from before access was turned off; activation
  // makes the assignments match it (R007).
  const held = await context.cell.held_roles.lockActive(partyId, { tx });
  const heldIds = held.map(row => row.role_id);
  for (const row of held)
    if (!wanted.includes(row.role_id)) {
      await context.cell.held_roles.release(row.id, context.actorId, { tx });
      const role =
        roles.get(row.role_id) ??
        (await context.cell.roles.lockById(row.role_id, { tx }));
      await context.record(heldChange(role, partyId, false), tx);
    }
  for (const id of wanted)
    if (!heldIds.includes(id)) {
      const role =
        roles.get(id) ?? (await context.cell.roles.lockById(id, { tx }));
      if (!role) throw new AccessControlError('NOT_FOUND');
      if (!roles.has(id)) {
        if (role.deactivated_at) throw new AccessControlError('INVALID_STATE');
        await requireCovered(context, role, tx);
      }
      await context.cell.held_roles.hold(
        {
          tenantId: context.tenant.id,
          partyId,
          roleId: id,
          actorId: context.actorId,
        },
        { tx }
      );
      await context.record(heldChange(role, partyId, true), tx);
    }
}

/**
 * The `role.granted` or `role.revoked` change for one assignment (M0003-R015).
 * @param {{id: string, code: string}} role
 * @param {string} portalUserId
 * @param {boolean} granted
 * @returns {import('./roles.js').RoleChange}
 */
function assignmentChange(role, portalUserId, granted) {
  return {
    eventKey: granted ? 'role.granted' : 'role.revoked',
    roleId: role.id,
    details: {
      role: role.code,
      portal_user_id: portalUserId,
      from_status: granted ? 'unassigned' : 'assigned',
      to_status: granted ? 'assigned' : 'unassigned',
    },
  };
}

/**
 * The `role.held` or `role.released` change for one held role (I0010 §12).
 * @param {{id: string, code: string}} role
 * @param {string} partyId
 * @param {boolean} held
 * @returns {import('./roles.js').RoleChange}
 */
function heldChange(role, partyId, held) {
  return {
    eventKey: held ? 'role.held' : 'role.released',
    roleId: role.id,
    details: {
      role: role.code,
      party_id: partyId,
      from_status: held ? 'unassigned' : 'held',
      to_status: held ? 'held' : 'unassigned',
    },
  };
}

/**
 * I0010-R007: when a person's membership copy arrives active, assign their
 * held roles to the login and clear the held set, in the same cell
 * transaction as the copy. The login's assignments end up exactly the held
 * set, so roles kept from before access was turned off and not chosen again
 * are removed. A held role archived meanwhile is still assigned and grants
 * nothing until restored (R008). Each change is recorded with the user who
 * chose the roles as its actor (I0010 §12).
 * @param {object} cell The cell repository handle `tx` came from.
 * @param {object} tx The sync apply's cell transaction.
 * @param {{tenantId: string, partyId: string, portalUserId: string}} membership
 * @returns {Promise<number>} How many held roles were applied.
 */
export async function applyHeldRoles(
  cell,
  tx,
  { tenantId, partyId, portalUserId }
) {
  // The sync apply runs outside a tenant transaction; the `app` tables need
  // the tenant setting for row-level security.
  await setTenant(tx, tenantId);
  const held = await cell.held_roles.lockActive(partyId, { tx });
  if (held.length === 0) return 0;
  const chooser = held.at(-1).created_by ?? portalUserId;
  const assigned = await cell.role_assignments.activeRoleIds(portalUserId, {
    tx,
  });
  const heldIds = held.map(row => row.role_id);
  const record = async (change, actorId) =>
    cell.outbox.insert(
      {
        tenant_id: tenantId,
        topic: 'role_change',
        entity_id: randomUUID(),
        revision: 1,
        payload: {
          tenant_id: tenantId,
          event_key: change.eventKey,
          role_id: change.roleId,
          actor_id: actorId,
          session_id: null,
          request_id: null,
          details: change.details,
        },
      },
      { tx }
    );
  for (const roleId of assigned.filter(id => !heldIds.includes(id))) {
    const role = await cell.roles.lockById(roleId, { tx });
    const assignment = await cell.role_assignments.lockActive(
      portalUserId,
      roleId,
      { tx }
    );
    await cell.role_assignments.archive(assignment.id, chooser, { tx });
    await record(assignmentChange(role, portalUserId, false), chooser);
  }
  for (const row of held) {
    const actorId = row.created_by ?? portalUserId;
    if (!assigned.includes(row.role_id)) {
      const role = await cell.roles.lockById(row.role_id, { tx });
      await cell.role_assignments.insert(
        {
          tenant_id: tenantId,
          portal_user_id: portalUserId,
          role_id: row.role_id,
          created_by: actorId,
          updated_by: actorId,
        },
        { tx }
      );
      await record(assignmentChange(role, portalUserId, true), actorId);
    }
    await cell.held_roles.release(row.id, actorId, { tx });
  }
  return held.length;
}
