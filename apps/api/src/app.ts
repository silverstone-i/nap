/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import type { CellRegistry } from './services/cellRegistry.js';
import { setAuditActorResolver } from 'pg-schemata';
import { requestContext } from './util/requestContext.js';
import { authConfiguration } from './util/authConfig.js';
import type { AuthConfiguration } from './util/authConfig.js';
import { sessionResolver } from './middleware/resolveSession.js';
import { healthResponseSchema, transportVersion } from '@nap/shared';
import { correlation } from './middleware/correlation.js';
import { requestLogging } from './middleware/requestLogging.js';
import { jsonBody } from './middleware/jsonBody.js';
import { errorHandler } from './middleware/errorHandler.js';
import { HttpError } from './util/httpError.js';
import { sendContract } from './util/sendContract.js';
import { mountRoutes } from './framework/routeRegistry.js';
import type { AdminHandle } from './db/admin/repositories.js';

/**
 * Does: Represents the database pools available to mounted module routers:
 * admin and the initialized UUID-keyed cell registry.
 * Used by: createApp and createRuntime.
 */
export type AppHandles = {
  readonly admin: AdminHandle;
  readonly cells: CellRegistry;
};

/**
 * Does: Builds the Express application: the shared middleware chain, the two
 * health endpoints, every registered module router, the not-found fallback,
 * and the error handler.
 * Called by: createRuntime at startup, and by app tests directly.
 * Why: it opens no listener and connects to no database, so tests can drive
 * it with in-memory requests. The isReady callback decides what the readiness
 * endpoint answers and defaults to "not ready", so a bare app never reports
 * itself ready to serve. Module routers are mounted only when the pools are
 * given; without them the app carries the health routes alone. The trusted
 * proxy hop count decides which address counts as the client's; it defaults
 * to none, so a forwarded-address header is ignored unless the deployment
 * says otherwise (PRD 0003, AUTH-005).
 */
export function createApp(
  isReady: () => Promise<boolean> = () => Promise.resolve(false),
  handles?: AppHandles,
  {
    trustProxyHops = 0,
    auth,
  }: {
    trustProxyHops?: number;
    auth?: AuthConfiguration;
  } = {}
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  const config = handles ? (auth ?? authConfiguration()) : undefined;
  setAuditActorResolver(() => requestContext.getStore()?.actorId ?? null);
  app.use(correlation, requestLogging);
  if (handles && config) app.use(sessionResolver(handles.admin, config));
  app.use(jsonBody);
  app.use(['/health/live', '/health/ready'], (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/health/live', (_request, response) => {
    sendContract(response, healthResponseSchema, {
      version: transportVersion,
      data: { status: 'ok' },
    });
  });
  app.get('/health/ready', async (_request, response) => {
    if (!(await isReady())) throw new HttpError('SERVICE_UNAVAILABLE');
    sendContract(response, healthResponseSchema, {
      version: transportVersion,
      data: { status: 'ok' },
    });
  });
  if (handles) mountRoutes(app, handles, config);
  app.use((_request, _response, next) => next(new HttpError('NOT_FOUND')));
  app.use(errorHandler);
  return app;
}
