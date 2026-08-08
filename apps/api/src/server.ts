/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createApp } from './app.js';
import {
  closeDb,
  initDb,
  probeDb,
  resolveConnectionString,
} from './db/index.js';
import type { AppConfig } from './util/appConfig.js';
import type { CookieConfig } from './util/cookies.js';
import { createLogger, parseLogLevel } from './util/logger.js';
import { resolveArgon2Params } from './util/passwordHash.js';

const SHUTDOWN_GRACE_MS = 10_000;

/**
 * Auth config from env. The signing secret gets no default — a server that
 * would mint tokens against an unconfigured key must not start (contrast
 * `createApp`'s per-process random default, which only tests reach).
 *
 * @throws {Error} When ACCESS_TOKEN_SECRET is unset or COOKIE_SAMESITE is
 *   not one of lax | strict | none.
 */
function resolveAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const secret = env.ACCESS_TOKEN_SECRET?.trim();
  if (secret === undefined || secret === '') {
    throw new Error(
      'ACCESS_TOKEN_SECRET must be set (generate one: openssl rand -hex 32)'
    );
  }

  const sameSite = (env.COOKIE_SAMESITE ?? 'lax').toLowerCase();
  if (sameSite !== 'lax' && sameSite !== 'strict' && sameSite !== 'none') {
    throw new Error(
      `COOKIE_SAMESITE must be lax, strict, or none, got "${sameSite}"`
    );
  }
  const cookies: CookieConfig = {
    secure: env.COOKIE_SECURE === 'true',
    sameSite,
  };

  return {
    accessTokenSecret: new TextEncoder().encode(secret),
    cookies,
    argon2: resolveArgon2Params(env),
  };
}

/**
 * Validated listen port. `listen(NaN)` binds a random port instead of
 * failing, so a malformed PORT must be rejected here.
 *
 * @throws {Error} When PORT is set but not an integer in 1–65535.
 */
function resolvePort(env: NodeJS.ProcessEnv): number {
  const raw = env.PORT ?? '3000';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer in 1–65535, got "${raw}"`);
  }
  return port;
}

// Startup order per RULES/api-server.md: read process.env → initDb() →
// probeDb() → listen(). The probe fails the process rather than letting it
// serve traffic against an unreachable database.
const logger = createLogger(parseLogLevel(process.env.LOG_LEVEL));
const port = resolvePort(process.env);
const appConfig = resolveAppConfig(process.env);

initDb(resolveConnectionString(process.env), logger);

try {
  await probeDb();
} catch (error) {
  logger.error('Database unreachable at startup; exiting', error);
  closeDb();
  process.exit(1);
}

const server = createApp(logger, appConfig).listen(port, () => {
  logger.info(`@nap/api listening on port ${port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  logger.error(`HTTP server failed on port ${port}`, error);
  closeDb();
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info(`${signal} received; shutting down`);

    // server.close() waits for in-flight and keep-alive connections; the
    // deadline keeps a lingering client from blocking shutdown forever.
    const deadline = setTimeout(() => {
      logger.warn(
        `Connections still open after ${SHUTDOWN_GRACE_MS}ms; forcing close`
      );
      server.closeAllConnections();
    }, SHUTDOWN_GRACE_MS);
    deadline.unref();

    server.close(() => {
      clearTimeout(deadline);
      closeDb();
      process.exit(0);
    });
  });
}
