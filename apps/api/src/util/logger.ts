/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import pino from 'pino';
import { requestContext } from './requestContext.js';
import type { Logger } from 'pg-schemata';

/**
 * Does: Writes structured JSON log lines to stdout, adding the current
 * request ID when one is in scope.
 * Used by: every module that logs, and the database logger adapter below.
 * Why: callers pass only fields they have chosen as safe; the logger adds
 * nothing from the request. Process identifiers are left out (base: null).
 */
export const logger = pino({
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: severity => ({ severity }) },
  mixin: () => {
    const context = requestContext.getStore();
    return context ? { requestId: context.requestId } : {};
  },
});

/**
 * Does: Builds the logger object the database library expects, forwarding
 * its messages to the shared logger tagged with the database name.
 * Called by: createAdminDatabase and createCellDatabase when creating a pool.
 * Why: messages from the library may contain SQL, row data, or connection
 * details, so only a short list of known-safe messages is passed through;
 * everything else is replaced with "Database diagnostic". Pattern-based
 * secret scrubbing was rejected because it cannot tell a SQL value from an
 * ordinary word. Errors raised during a request are dropped here because
 * the HTTP error handler already logs that failure.
 */
export function createDatabaseLogger(target: 'admin' | 'cell'): Logger {
  const safeMessages = new Set(['Truncating table']);
  /** Does: Writes one message at the level given, unsafe text replaced. */
  function emit(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string | Error
  ) {
    if (level === 'error' && requestContext.getStore()) return;
    const safe =
      typeof message === 'string' && safeMessages.has(message)
        ? message
        : 'Database diagnostic';
    logger[level]({ event: 'database.diagnostic', database: target }, safe);
  }
  return {
    debug: message => emit('debug', message),
    info: message => emit('info', message),
    warn: message => emit('warn', message),
    error: message => emit('error', message),
  };
}
