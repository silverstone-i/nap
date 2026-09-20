/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { sendError } from '../framework/envelope.js';

/** Methods that must not carry a business mutation, so they need no origin proof. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Reduce a header value to its origin, or `null` when it cannot be trusted.
 *
 * The opaque origin arrives as the literal string `null`, which `new URL`
 * rejects anyway; both cases return `null` so the caller refuses the request.
 * @param {unknown} value
 * @returns {string|null}
 */
function originOf(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = new URL(value);
    return parsed.origin === 'null' ? null : parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Normalize the configured public application origin.
 * @param {string} value Absolute `http` or `https` origin.
 * @returns {string} Scheme, hostname, and port, with no path.
 * @throws {Error} When the value is not an absolute HTTP origin.
 */
export function trustedOrigin(value) {
  const origin = originOf(value);
  if (!origin || !/^https?:$/.test(new URL(origin).protocol))
    throw new Error('Invalid application origin');
  return origin;
}

/**
 * Require proof of same-origin for every state-changing request.
 *
 * `Origin` is authoritative when present: a mismatched, malformed, or opaque
 * value is rejected outright rather than falling back to `Referer`, because
 * a cross-site request that suppresses `Origin` could otherwise supply a
 * forgiving `Referer`. `Referer` is consulted only when `Origin` is absent,
 * and a request with neither header is refused. The trusted origin comes
 * from configuration, never from `Host` or a forwarded header, so a proxy
 * cannot be talked into widening it.
 *
 * The check runs before session resolution and before body parsing, so a
 * rejected request leaves application state unchanged. It applies to bodyless
 * requests and uploads alike, which is why it is registered for the method
 * rather than for a content type.
 * @param {string} applicationOrigin Configured public application origin.
 * @returns {import('express').RequestHandler}
 * @throws {Error} When `applicationOrigin` is not an absolute HTTP origin.
 */
export function browserRequestProtection(applicationOrigin) {
  const trusted = trustedOrigin(applicationOrigin);
  return (request, response, next) => {
    if (SAFE_METHODS.has(request.method)) return next();
    const header = request.headers.origin;
    const presented =
      header === undefined
        ? originOf(request.headers.referer)
        : originOf(header);
    if (presented !== trusted) return sendError(response, 'FORBIDDEN');
    next();
  };
}
