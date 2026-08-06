/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  closeDb,
  initDb,
  probeDb,
  resolveConnectionString,
} from '../db/index.js';
import { createLogger, parseLogLevel } from '../util/logger.js';
import { bootstrapAdmin } from './lib/bootstrapAdmin.js';
import type { BootstrapConfig } from './lib/bootstrapAdmin.js';

/**
 * Root identity from env, one throw per missing or malformed variable.
 * Every variable here appears in `.env.example` with a safe local default.
 */
function resolveBootstrapConfig(env: NodeJS.ProcessEnv): BootstrapConfig {
  const read = (name: string): string => {
    const value = env[name]?.trim();
    if (value === undefined || value === '') {
      throw new Error(`${name} must be set for db:bootstrap`);
    }
    return value;
  };

  const tenantCode = read('ROOT_TENANT_CODE');
  if (tenantCode.length > 6) {
    throw new Error(
      `ROOT_TENANT_CODE must be at most 6 characters, got "${tenantCode}"`
    );
  }

  const rawRounds = env.BCRYPT_ROUNDS ?? '12';
  const bcryptRounds = Number(rawRounds);
  if (!Number.isInteger(bcryptRounds) || bcryptRounds < 4) {
    throw new Error(
      `BCRYPT_ROUNDS must be an integer of at least 4, got "${rawRounds}"`
    );
  }

  return {
    tenantCode,
    company: read('ROOT_COMPANY'),
    email: read('ROOT_EMAIL'),
    password: read('ROOT_PASSWORD'),
    bcryptRounds,
  };
}

// Entrypoint shape per RULES/api-server.md: scripts read process.env, init
// the singleton, do the work, and own the exit code.
const logger = createLogger(parseLogLevel(process.env.LOG_LEVEL));

try {
  const config = resolveBootstrapConfig(process.env);
  initDb(resolveConnectionString(process.env), logger);
  await probeDb();
  await bootstrapAdmin(config, logger);
  logger.info('Bootstrap complete');
  closeDb();
} catch (error) {
  logger.error('Bootstrap failed', error);
  closeDb();
  process.exit(1);
}
