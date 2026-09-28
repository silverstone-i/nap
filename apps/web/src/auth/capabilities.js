/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Capability gating from `GET /session/capabilities` (I0005-R011).
 * Hiding something here never grants or denies access; the server decides.
 */

import { patternMatches } from '@nap/shared';

/**
 * Whether the session's resolved set matches a route capability.
 * @param {{patterns: string[], targetTenant: {code: string}|null, napsoftTenant: {code: string}|null}|null} capabilities
 * @param {string} routeCapability `module::router::action`
 * @param {'session'|'napsoft'} [target='session'] `napsoft` for records
 *   Napsoft manages about tenants (I0005-R003).
 * @returns {boolean}
 */
export function can(capabilities, routeCapability, target = 'session') {
  if (!capabilities) return false;
  const tenant =
    target === 'napsoft'
      ? capabilities.napsoftTenant
      : capabilities.targetTenant;
  if (!tenant) return false;
  const required = `${tenant.code}::${routeCapability}`;
  const napsoftCode = capabilities.napsoftTenant?.code ?? null;
  return capabilities.patterns.some(pattern =>
    patternMatches(pattern, required, napsoftCode)
  );
}

const REASONS = {
  NO_CAPABILITY: 'your roles do not include it',
  NOT_ENTITLED: 'this tenant is not entitled to the module',
  INACTIVE: 'your account or membership is not active',
  RESTRICTED: 'you must change your password first',
};

/**
 * The message for a server denial, with its reason (I0005-R011).
 * @param {{reason?: string|null}} err An `ApiError` with code `FORBIDDEN`.
 * @returns {string}
 */
export function denialMessage(err) {
  const reason = REASONS[err?.reason];
  return reason
    ? `You are not authorized to perform that action: ${reason}.`
    : 'You are not authorized to perform that action.';
}
