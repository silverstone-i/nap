/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import {
  ERROR_STATUS,
  errorEnvelope,
  sendError,
} from '../framework/envelope.js';
import { isRegisteredCapability } from '../modules/access-control/domain/catalogue.js';
import { parseCapability } from '../modules/access-control/domain/patterns.js';
import { authorize } from './authorize.js';

/**
 * Send the I0005-R007 denial: 403 with the required capability and reason.
 * @param {import('express').Response} response
 * @param {{capability: string, reason: string}} result
 * @returns {void}
 */
function sendDenied(response, { capability, reason }) {
  const body = errorEnvelope('FORBIDDEN');
  body.error.capability = capability;
  body.error.reason = reason;
  response.setHeader('Cache-Control', 'no-store');
  response.status(403).json(body);
}

/**
 * Record a denial (I0005-R007): a denied write appends `access.denied`; a
 * denied read is logged only. A failed append never turns the 403 into a
 * different response.
 * @param {object} admin Admin repository handle.
 * @param {import('express').Request} request
 * @param {object} result The `authorize` result.
 * @returns {Promise<void>}
 */
async function recordDenial(admin, request, result) {
  const entry = {
    capability: result.capability,
    reason: result.reason,
    method: request.method,
  };
  if (request.method === 'GET' || request.method === 'HEAD') {
    console.warn(JSON.stringify({ event: 'access.denied', ...entry }));
    return;
  }
  try {
    await admin.managed_events.append({
      deduplication_key: randomUUID(),
      event_key: 'access.denied',
      outcome: 'denied',
      actor_id: result.actorId,
      tenant_id: result.targetTenant.id,
      session_id: request.session?.id ?? null,
      request_id: request.requestId ?? null,
      reason: result.reason,
      details: { capability: result.capability, method: request.method },
    });
  } catch {
    console.warn(JSON.stringify({ event: 'access.denied', ...entry }));
  }
}

/**
 * Declare and enforce a route capability (I0005-R001). Runs after
 * `requireSession()`. On permit, `request.authorization` holds the decision
 * (`actorId`, `capability`, `patterns`, `homeTenant`, `targetTenant`,
 * `napsoftCode`); on deny the route never runs.
 *
 * Dependencies come from `request.app.locals.authorization`, set when the
 * API is mounted.
 * @param {string} routeCapability `module::router::action`
 * @param {{target?: 'session'|'napsoft'}} [options] `napsoft` for records
 *   Napsoft manages about tenants (I0005-R003).
 * @returns {import('express').RequestHandler}
 */
export function requireCapability(routeCapability, options = {}) {
  const handler = async (request, response, next) => {
    const deps = request.app.locals.authorization;
    let result;
    try {
      result = await authorize(deps, request.session, routeCapability, options);
    } catch (error) {
      const code = error?.code;
      return sendError(
        response,
        typeof code === 'string' && Object.hasOwn(ERROR_STATUS, code)
          ? code
          : 'INTERNAL_ERROR'
      );
    }
    if (result.decision !== 'permit') {
      await recordDenial(deps.admin.db, request, result);
      return sendDenied(response, result);
    }
    request.authorization = result;
    next();
  };
  handler.capability = routeCapability;
  return handler;
}

/**
 * Mark a protected route that needs only a session, not a capability: the
 * caller's own session, context, password, or tenant selection.
 * @type {import('express').RequestHandler}
 */
export function sessionOnly(_request, _response, next) {
  next();
}
sessionOnly.sessionOnly = true;

/**
 * Check one built router at startup (I0005-R002). Every route guarded by
 * `requireSession()` must declare a registered capability with
 * `requireCapability` or be marked `sessionOnly`, and a `read` capability
 * belongs on `GET` only.
 * @param {import('express').Router} router
 * @param {string} path Mount path, for the error message.
 * @returns {void}
 * @throws {Error} Naming the first offending route.
 */
export function checkRouteCapabilities(router, path) {
  for (const layer of router.stack ?? []) {
    if (layer.handle?.stack) {
      checkRouteCapabilities(layer.handle, path);
      continue;
    }
    const route = layer.route;
    if (!route) continue;
    const handles = route.stack.map(entry => entry.handle);
    const where = `${Object.keys(route.methods).join(',').toUpperCase()} ${path}${route.path}`;
    if (!handles.some(handle => handle.requiresSession)) continue;
    if (handles.some(handle => handle.sessionOnly)) continue;
    const declared = handles.find(handle => handle.capability)?.capability;
    if (!declared) throw new Error(`Route declares no capability: ${where}`);
    if (!parseCapability(declared) || !isRegisteredCapability(declared))
      throw new Error(`Route capability not catalogued: ${where}`);
    const methods = Object.keys(route.methods).filter(
      method => method !== '_all'
    );
    if (
      declared.endsWith('::read') &&
      methods.some(method => method !== 'get' && method !== 'head')
    )
      throw new Error(`Read capability on a non-GET route: ${where}`);
  }
}
