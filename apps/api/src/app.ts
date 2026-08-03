/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import type { Logger } from 'pg-schemata';

// The health check is mounted here in the bootstrap, not in modules/: it must
// answer before auth, RBAC, or entitlement middleware exist and must never be
// gated by them.
export function createApp(
  logger: Required<Pick<Logger, 'error'>> = { error: console.error }
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
