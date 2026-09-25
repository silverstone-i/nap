/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  healthResponse,
  notFoundResponse,
  transportVersion,
} from '@nap/shared';
import { createRouteRegistry } from './framework/routeRegistry.js';
import { errorEnvelope, sendError } from './framework/envelope.js';
import { correlation } from './middleware/correlation.js';
import { browserRequestProtection } from './middleware/browserRequestProtection.js';
import { jsonBodyOnly } from './middleware/jsonBody.js';
import { sessionContext } from './middleware/sessionContext.js';

/** Largest JSON body any admin route accepts. Session routes send far less. */
const JSON_BODY_LIMIT = '64kb';

/**
 * Mount the API request chain and every registered router under `/api`.
 *
 * The order is the one docs/architecture/bff.md#request-flow requires, and
 * each step depends on the one before it. Correlation runs first so every
 * later event carries a request identifier. Browser request protection runs
 * next, before the body is parsed and before the session is resolved, so a
 * cross-origin request is refused without touching application state.
 * Session resolution runs last, so a route receives a context that has
 * already been checked for expiry and account eligibility.
 * @param {import('express').Express} app
 * @param {object} api
 * @param {import('pg-schemata').Database} api.admin Admin database handle.
 * @param {'dev'|'test'|'prod'} [api.environment] The running API's own configured environment, passed to routers that need it rather than trusting client input.
 * @param {object} api.sessionPolicy Session secret and lifetimes.
 * @param {object} api.authenticationPolicy Throttle secret and Argon2id parameters.
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} api.cookiePolicy
 * @param {string} api.applicationOrigin Configured public application origin.
 * @param {{readiness: Function, markDisabled: Function}} [api.runtime] Runtime cell registry (I0003-R020).
 * @param {object[]} [api.registrations] Route registrations to mount.
 * @returns {void}
 * @throws {Error} When the application origin or a registration is invalid.
 */
function mountApi(app, api) {
  const {
    admin,
    environment,
    sessionPolicy,
    authenticationPolicy,
    cookiePolicy,
    applicationOrigin,
    runtime,
    registrations = [],
  } = api;
  const registry = createRouteRegistry();
  for (const registration of registrations) registry.register(registration);
  app.use('/api', correlation());
  app.use('/api', browserRequestProtection(applicationOrigin));
  app.use('/api', jsonBodyOnly());
  app.use('/api', express.json({ limit: JSON_BODY_LIMIT }));
  // A malformed or oversized body is the caller's mistake, not a server
  // failure, so it must not reach the 500 handler at the bottom of the app.
  app.use('/api', (error, _request, response, next) => {
    if (response.headersSent) return next(error);
    if (error?.type || error instanceof SyntaxError)
      return sendError(response, 'INVALID_INPUT');
    next(error);
  });
  app.use('/api', sessionContext({ admin, sessionPolicy, cookiePolicy }));
  registry.mount(app, {
    admin,
    environment,
    sessionPolicy,
    authenticationPolicy,
    cookiePolicy,
    runtime,
  });
}

/**
 * Build the Express application for the backend-for-frontend (BFF).
 *
 * Registers, in order: `/health/live`; `/health/ready` when `isReady` is
 * supplied; the API request chain and module routers when `api` is supplied;
 * static assets and the single-page-app fallback when `webRoot`
 * is supplied; a JSON 404 for everything else; and a JSON 500 error
 * handler. Paths under `/api` and `/health` never fall back to the web client.
 * @param {object} [options]
 * @param {string} [options.webRoot] Directory holding the built web client; must contain `index.html`.
 * @param {number} [options.trustProxyHops=0] Trusted reverse-proxy hop count, 0 to 16.
 * @param {() => Promise<boolean> | boolean} [options.isReady] Readiness probe; a thrown error reports not ready.
 * @param {object} [options.api] Admin handle, session, authentication, and cookie policy, application origin, and route registrations.
 * @returns {import('express').Express}
 * @throws {Error} When `trustProxyHops` is out of range, `webRoot` has no `index.html`, or `api` is misconfigured.
 */
export function createApp({ webRoot, trustProxyHops = 0, isReady, api } = {}) {
  if (
    !Number.isInteger(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 16
  )
    throw new Error('Invalid proxy hop count');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  app.get('/health/live', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json(healthResponse);
  });
  if (isReady)
    app.get('/health/ready', async (_request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      let ready = false;
      try {
        ready = await isReady();
      } catch {
        /* Readiness failures use the same safe response. */
      }
      response.status(ready ? 200 : 503).json(
        ready
          ? healthResponse
          : {
              version: transportVersion,
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Service unavailable',
              },
            }
      );
    });
  if (api) mountApi(app, api);
  if (webRoot) {
    const directory = resolve(webRoot);
    const entry = resolve(directory, 'index.html');
    if (!statSync(entry, { throwIfNoEntry: false })?.isFile())
      throw new Error('Built web client is unavailable');
    const assets = express.static(directory, {
      index: false,
      dotfiles: 'ignore',
    });
    const reserved = path => /^\/(?:api|health)(?:\/|$)/.test(path);
    app.use((request, response, next) => {
      if (reserved(request.path)) return next();
      assets(request, response, next);
    });
    app.use((request, response, next) => {
      if (
        !['GET', 'HEAD'].includes(request.method) ||
        reserved(request.path) ||
        request.path.includes('.') ||
        !request.accepts('html')
      )
        return next();
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(entry, error => {
        if (error) next(error);
      });
    });
  }
  app.use((_request, response) => response.status(404).json(notFoundResponse));
  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    response.status(500).json(errorEnvelope('INTERNAL_ERROR'));
  });
  return app;
}
