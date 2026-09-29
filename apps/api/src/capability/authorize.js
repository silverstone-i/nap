/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { adminModules } from '../modules/admin.js';
import { cellModules } from '../modules/cell.js';
import { resolvePatterns } from '../modules/access-control/domain/callerPatterns.js';
import { decide, requiredCapability } from './decision.js';

/** Failure that stops a decision before it is made. */
export class AuthorizationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const TENANT_COLUMNS = ['id', 'tenant_code', 'is_napsoft', 'cell_id'];

/**
 * Whether `tenantId` is entitled to `module` (M0001-10): foundation and
 * infrastructure modules always are; an optional module needs an enabled
 * entitlement row.
 * @param {object} admin Admin repository handle.
 * @param {string} tenantId
 * @param {string} module
 * @returns {Promise<boolean>}
 */
async function isEntitled(admin, tenantId, module) {
  const descriptor = [...adminModules, ...cellModules].find(
    entry => entry.name === module
  );
  if (!descriptor) return false;
  if (descriptor.entitlementType !== 'optional') return true;
  const row = await admin.module_entitlements.findOneBy(
    { tenant_id: tenantId, module, enabled: true },
    { columnWhitelist: ['id'] }
  );
  return Boolean(row);
}

/**
 * The user's home tenant (I0005 §5) and the membership that makes it home:
 * the Napsoft tenant for an active Napsoft member, otherwise the target
 * tenant when the user is an active member of it.
 * @param {object} admin
 * @param {string} userId
 * @param {{id: string}|null} target
 * @returns {Promise<{tenant: object, membershipId: string}|null>}
 */
async function homeTenant(admin, userId, target) {
  const memberships = await admin.portal_user_tenants.findWhere(
    { portal_user_id: userId, status: 'active' },
    'AND',
    { columnWhitelist: ['id', 'tenant_id'] }
  );
  if (memberships.length === 0) return null;
  const tenants = await admin.tenants.findWhere(
    { id: { $in: memberships.map(row => row.tenant_id) } },
    'AND',
    { columnWhitelist: TENANT_COLUMNS }
  );
  const home =
    tenants.find(tenant => tenant.is_napsoft) ??
    tenants.find(tenant => tenant.id === target?.id);
  if (!home) return null;
  return {
    tenant: home,
    membershipId: memberships.find(row => row.tenant_id === home.id).id,
  };
}

/**
 * The resolved set from the home tenant's cell (I0005-R004), cached against
 * the home tenant's `roles` revision and the user and membership revisions
 * (I0005-R008). A cached set is used only while those revisions still
 * match; otherwise a cell that cannot be read denies (R009).
 * @param {{admin: object, runtime?: object, cache?: object}} deps
 * @param {string} userId
 * @param {{tenant: object, membershipId: string}} home
 * @returns {Promise<string[]>}
 * @throws {AuthorizationError} `CELL_UNAVAILABLE`
 */
async function loadPatterns({ runtime, cache }, userId, home) {
  const { tenant, membershipId } = home;
  const load = async () => {
    if (!tenant.cell_id || !runtime)
      throw new AuthorizationError('CELL_UNAVAILABLE');
    try {
      return await resolvePatterns(runtime.dbFor(tenant.cell_id), {
        tenantId: tenant.id,
        portalUserId: userId,
      });
    } catch {
      throw new AuthorizationError('CELL_UNAVAILABLE');
    }
  };
  if (!cache) return load();
  return cache.getOrLoad(
    `patterns:${tenant.id}:${userId}`,
    [
      { domain: 'roles', entity: tenant.id },
      { domain: 'membership', entity: membershipId },
      { domain: 'user', entity: userId },
    ],
    load
  );
}

/**
 * Resolve the caller for one target tenant (I0005-R004): the active user,
 * the home tenant, and the resolved set. A restricted session, an inactive
 * user, or a user with no home tenant resolves to no patterns.
 * @param {{admin: object, runtime?: object, cache?: object}} deps `admin` is the repository handle (`admin.db`).
 * @param {{user: string, restricted?: boolean}} session
 * @param {object|null} targetTenant
 * @returns {Promise<{active: boolean, patterns: string[], homeTenant: object|null}>}
 * @throws {AuthorizationError} `CELL_UNAVAILABLE`
 */
export async function resolveCaller(deps, session, targetTenant) {
  const admin = deps.admin.db;
  const user = await admin.portal_users.findOneBy(
    { id: session.user, status: 'active' },
    { columnWhitelist: ['id'] }
  );
  const home = user ? await homeTenant(admin, user.id, targetTenant) : null;
  const patterns =
    home && session.restricted !== true
      ? await loadPatterns(deps, user.id, home)
      : [];
  return { active: Boolean(home), patterns, homeTenant: home?.tenant ?? null };
}

/**
 * The Napsoft tenant and the target tenant for a session (I0005-R003).
 * @param {object} admin Admin repository handle.
 * @param {{tenant?: string|null}} session
 * @param {'session'|'napsoft'} target
 * @returns {Promise<{napsoft: object|null, targetTenant: object|null}>}
 */
export async function resolveTenants(admin, session, target) {
  const napsoft = await admin.tenants.findOneBy(
    { is_napsoft: true },
    { columnWhitelist: TENANT_COLUMNS }
  );
  if (target === 'napsoft') return { napsoft, targetTenant: napsoft };
  const targetTenant = session.tenant
    ? await admin.tenants.findOneBy(
        { id: session.tenant },
        { columnWhitelist: TENANT_COLUMNS }
      )
    : null;
  return { napsoft, targetTenant };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decide one route capability against one target tenant.
 * @param {{admin: object, runtime?: object, cache?: object}} deps
 * @param {{user: string, restricted?: boolean}} session
 * @param {string} routeCapability
 * @param {object} targetTenant
 * @param {string|null} napsoftCode
 * @returns {Promise<object>} The `authorize` result.
 */
async function decideFor(
  deps,
  session,
  routeCapability,
  targetTenant,
  napsoftCode
) {
  const capability = requiredCapability(
    targetTenant.tenant_code,
    routeCapability
  );
  const [caller, entitled] = await Promise.all([
    resolveCaller(deps, session, targetTenant),
    isEntitled(deps.admin.db, targetTenant.id, routeCapability.split('::')[0]),
  ]);
  return {
    ...decide({
      restricted: session.restricted === true,
      active: caller.active,
      entitled,
      patterns: caller.patterns,
      required: capability,
      napsoftCode,
    }),
    capability,
    actorId: session.user,
    patterns: caller.patterns,
    homeTenant: caller.homeTenant,
    targetTenant,
    napsoftCode,
  };
}

/**
 * Resolve the caller's patterns and decide one route capability (I0005).
 *
 * With `orTenantParam`, a route that targets Napsoft also permits a caller
 * whose own grant covers the customer tenant named in that path parameter
 * (M0001-10 §4: `tenant_admin` reads its own tenant's entitlements). The
 * Napsoft decision is tried first; the tenant decision is used only when it
 * permits.
 * @param {{admin: object, runtime?: object, cache?: object}} deps `admin` is the repository handle (`admin.db`).
 * @param {{user: string, tenant?: string|null, restricted?: boolean}} session
 * @param {string} routeCapability `module::router::action`
 * @param {{target?: 'session'|'napsoft', orTenantParam?: string, params?: Record<string, string>}} [options]
 *   `target: 'napsoft'` for records Napsoft manages about tenants (I0005-R003).
 * @returns {Promise<{decision: 'permit'|'deny', reason: string, capability: string, actorId: string, patterns: string[], homeTenant: object|null, targetTenant: object, napsoftCode: string|null}>}
 * @throws {AuthorizationError} `INVALID_STATE` when a session-targeted
 *   route has no selected tenant; `CELL_UNAVAILABLE`.
 */
export async function authorize(
  deps,
  session,
  routeCapability,
  { target = 'session', orTenantParam, params } = {}
) {
  const admin = deps.admin.db;
  const { napsoft, targetTenant } = await resolveTenants(
    admin,
    session,
    target
  );
  if (!targetTenant) throw new AuthorizationError('INVALID_STATE');
  const napsoftCode = napsoft?.tenant_code ?? null;
  const result = await decideFor(
    deps,
    session,
    routeCapability,
    targetTenant,
    napsoftCode
  );
  const tenantId = orTenantParam ? params?.[orTenantParam] : undefined;
  if (
    result.decision === 'permit' ||
    typeof tenantId !== 'string' ||
    !UUID_PATTERN.test(tenantId)
  )
    return result;
  const named = await admin.tenants.findOneBy(
    { id: tenantId },
    { columnWhitelist: TENANT_COLUMNS }
  );
  if (!named || named.is_napsoft) return result;
  const own = await decideFor(
    deps,
    session,
    routeCapability,
    named,
    napsoftCode
  );
  return own.decision === 'permit' ? own : result;
}
