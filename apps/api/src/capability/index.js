/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Parse a capability without granting authority for malformed input.
 * @param {unknown} value
 * @param {boolean} allowWildcard
 * @returns {[string, string, string]|null}
 */
function parseCapability(value, allowWildcard) {
  if (typeof value !== 'string') return null;
  const components = value.split('::');
  if (components.length !== 3) return null;
  if (
    components.some(
      component =>
        !(
          IDENTIFIER_PATTERN.test(component) ||
          (allowWildcard && component === '*')
        )
    )
  )
    return null;
  return /** @type {[string, string, string]} */ (components);
}

/**
 * Validate a capability identifier or stored grant pattern.
 *
 * Requested capabilities should pass `allowWildcard: false`; stored grants
 * may use the default to accept an explicit `*` component.
 * @param {unknown} value
 * @param {{allowWildcard?: boolean}} [options]
 * @returns {string} The validated capability unchanged.
 * @throws {TypeError} When the value is not a valid capability.
 */
export function validateCapability(value, { allowWildcard = true } = {}) {
  if (!parseCapability(value, allowWildcard))
    throw new TypeError('Invalid capability');
  return value;
}

/**
 * Whether a stored capability grant authorizes one explicit capability.
 *
 * Each `*` in the grant matches the corresponding module, router, or action.
 * Invalid grants and wildcard-bearing requested capabilities fail closed.
 * Tenant scope is evaluated separately before this matcher is called.
 * @param {unknown} grant
 * @param {unknown} requested
 * @returns {boolean}
 */
export function matchesCapability(grant, requested) {
  const pattern = parseCapability(grant, true);
  const target = parseCapability(requested, false);
  if (!pattern || !target) return false;
  return pattern.every(
    (component, index) => component === '*' || component === target[index]
  );
}
