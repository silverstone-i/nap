/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import pino from 'pino';
import { requestContext } from './requestContext.js';
import type { Logger } from 'pg-schemata';

/** Shared stdout destination; callers pass only preselected safe fields. */
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
 * Adapt database diagnostics without accepting row metadata or arbitrary text.
 * Exact safe messages are deliberately conservative: regex secret replacement
 * cannot distinguish a SQL value from an ordinary word. Request errors are
 * emitted by the HTTP boundary; outside requests the adapter owns diagnostics.
 */
export function createDatabaseLogger(target: 'admin' | 'cell'): Logger {
  const safeMessages = new Set(['Truncating table']);
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
