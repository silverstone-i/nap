/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomBytes } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Logger } from 'pg-schemata';
import { createApiRoutes } from './apiRoutes.js';
import type { AppConfig } from './util/appConfig.js';
import { OWASP_BASELINE } from './util/passwordHash.js';

/**
 * Defaults keep `createApp()` callable with no arguments and no environment
 * (tests). The secret default is a fresh random key per process — never a
 * hardcoded value — and production cannot land on it: `server.ts` throws
 * when ACCESS_TOKEN_SECRET is unset.
 */
function defaultConfig(): AppConfig {
  return {
    accessTokenSecret: randomBytes(32),
    cookies: { secure: false, sameSite: 'lax' },
    argon2: OWASP_BASELINE,
  };
}

// The health check is mounted here in the bootstrap, not in modules/: it must
// answer before auth, RBAC, or entitlement middleware exist and must never be
// gated by them.
export function createApp(
  logger: Required<Pick<Logger, 'error'>> = { error: console.error },
  config: AppConfig = defaultConfig()
): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    const health = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    res.json(health);
  });

  // Body and cookie parsing sit ahead of the routes; building the routers
  // touches no database — handlers reach getDb() only per request
  // (RULES/api-server.md: createApp must not require a database).
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', createApiRoutes(config));

  // 404 and error handlers stay the final two app.use calls
  // (RULES/api-server.md). The error handler keeps four parameters — Express 5
  // detects error handlers by arity.
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error(err instanceof Error ? err : new Error(String(err)));
      res.status(500).json({ error: 'Internal server error' });
    }
  );

  return app;
}
