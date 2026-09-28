/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { coveredBy } from '../modules/access-control/domain/patterns.js';

/** Deny reasons and the permit reason (I0005-R006). */
export const REASONS = Object.freeze([
  'ROLE',
  'NO_CAPABILITY',
  'NOT_ENTITLED',
  'INACTIVE',
  'RESTRICTED',
]);

/**
 * The required capability: the target tenant's code followed by the route
 * capability (I0005-R003).
 * @param {string} tenantCode
 * @param {string} routeCapability `module::router::action`
 * @returns {string}
 */
export function requiredCapability(tenantCode, routeCapability) {
  return `${tenantCode}::${routeCapability}`;
}

/**
 * Decide one request (I0005-R005, R006). A pattern matches the required
 * capability when it covers it: each part equal or `*`, and a tenant `*`
 * never matching the Napsoft tenant. An unentitled module denies whatever
 * the patterns say.
 * @param {object} input
 * @param {boolean} input.restricted The session is restricted.
 * @param {boolean} input.active The user and their home membership are active.
 * @param {boolean} input.entitled The target tenant is entitled to the module.
 * @param {string[]} input.patterns The resolved set.
 * @param {string} input.required The required capability.
 * @param {string|null} input.napsoftCode
 * @returns {{decision: 'permit'|'deny', reason: string}}
 */
export function decide({
  restricted,
  active,
  entitled,
  patterns,
  required,
  napsoftCode,
}) {
  if (restricted) return { decision: 'deny', reason: 'RESTRICTED' };
  if (!active) return { decision: 'deny', reason: 'INACTIVE' };
  if (!entitled) return { decision: 'deny', reason: 'NOT_ENTITLED' };
  if (!coveredBy(patterns, required, { napsoftCode }))
    return { decision: 'deny', reason: 'NO_CAPABILITY' };
  return { decision: 'permit', reason: 'ROLE' };
}
