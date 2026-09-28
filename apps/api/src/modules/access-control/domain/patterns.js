/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Capability and capability-pattern grammar (M0003-R003–R005, R011).
 *
 * A capability is `TENANT::module::router::action`; a route declares the last
 * three parts (`module::router::action`) and I0005 prefixes the target
 * tenant's code. A pattern has the same four parts, any of which may be `*`.
 * The `app.role_grants` check constraint enforces the same grammar in the
 * database.
 */

const WILDCARD = '*';
const TENANT_PART = /^[A-Z0-9_-]+$/;
const NAME_PART = /^[a-z0-9-]+$/;
/** Module and router names in a descriptor, matching the route registry. */
const DECLARED_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Parse a four-part pattern (M0003-R003).
 * @param {unknown} value
 * @returns {{tenant: string, module: string, router: string, action: string}|null}
 *   The parts, or `null` when the value is not a well-formed pattern.
 */
export function parsePattern(value) {
  if (typeof value !== 'string' || value.length > 255) return null;
  const parts = value.split('::');
  if (parts.length !== 4) return null;
  const [tenant, module, router, action] = parts;
  if (tenant !== WILDCARD && !TENANT_PART.test(tenant)) return null;
  for (const part of [module, router, action])
    if (part !== WILDCARD && !NAME_PART.test(part)) return null;
  return { tenant, module, router, action };
}

/**
 * Parse a declared route capability `module::router::action` (M0003-R005).
 * Every part is exact: a declaration never uses `*`.
 * @param {unknown} value
 * @returns {{module: string, router: string, action: string}|null}
 */
export function parseCapability(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('::');
  if (parts.length !== 3) return null;
  const [module, router, action] = parts;
  if (!DECLARED_NAME.test(module) || !DECLARED_NAME.test(router)) return null;
  if (!DECLARED_NAME.test(action)) return null;
  return { module, router, action };
}

/**
 * Whether one tenant part covers another. Equal parts always cover. A `*`
 * covers every tenant code except the Napsoft tenant's, and covers another
 * `*`: a grant's `*` never matches Napsoft either (I0005-R005), so `*` over
 * `*` never widens reach. A tenant code never covers `*`.
 * @param {string} a Tenant part of the covering pattern.
 * @param {string} b Tenant part of the covered pattern.
 * @param {string|null} napsoftCode The Napsoft tenant's `tenant_code`.
 * @returns {boolean}
 */
function tenantCovers(a, b, napsoftCode) {
  if (a === b) return true;
  if (a !== WILDCARD) return false;
  return b === WILDCARD || b !== napsoftCode;
}

/**
 * Whether pattern `a` covers pattern `b` (M0003-R011): every capability `b`
 * can match, `a` can match too. Each part of `a` equals `b`'s or is `*`,
 * except that a tenant `*` never covers the Napsoft tenant's code — so
 * `*::*::*::*` does not cover `NAP::*::*::*`, and a Napsoft administrator
 * needs a `NAP` pattern to hand out `NAP` grants.
 *
 * A malformed pattern on either side covers nothing and is covered by
 * nothing.
 * @param {string} a
 * @param {string} b
 * @param {{napsoftCode: string|null}} options
 * @returns {boolean}
 */
export function covers(a, b, { napsoftCode }) {
  const left = parsePattern(a);
  const right = parsePattern(b);
  if (!left || !right) return false;
  if (!tenantCovers(left.tenant, right.tenant, napsoftCode)) return false;
  return ['module', 'router', 'action'].every(
    part => left[part] === WILDCARD || left[part] === right[part]
  );
}

/**
 * Whether some pattern in `patterns` covers `pattern`.
 * @param {string[]} patterns The caller's resolved patterns.
 * @param {string} pattern
 * @param {{napsoftCode: string|null}} options
 * @returns {boolean}
 */
export function coveredBy(patterns, pattern, options) {
  return patterns.some(own => covers(own, pattern, options));
}

/**
 * Whether a pattern's exact module, router, and action parts name something
 * in the catalogue (M0003-R004). The exact parts must hold together: at least
 * one catalogued capability must agree with every exact part, so
 * `*::access-control::*::read` passes while `*::access-control::control::*`
 * fails even though `control` is a router elsewhere. A pattern that could
 * never match a catalogued capability is therefore rejected.
 * @param {string} pattern A pattern already accepted by `parsePattern`.
 * @param {{module: string, router: string, action: string}[]} catalogue
 * @returns {boolean}
 */
export function patternInCatalogue(pattern, catalogue) {
  const parsed = parsePattern(pattern);
  if (!parsed) return false;
  return catalogue.some(entry =>
    ['module', 'router', 'action'].every(
      part => parsed[part] === WILDCARD || parsed[part] === entry[part]
    )
  );
}
