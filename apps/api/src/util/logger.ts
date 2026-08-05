/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Logger, LogLevel } from 'pg-schemata';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LEVELS = Object.keys(LEVEL_ORDER) as LogLevel[];

/** Narrows an arbitrary string to a {@link LogLevel}, or undefined. */
export function parseLogLevel(value: string | undefined): LogLevel | undefined {
  return LEVELS.find(level => level === value);
}

/**
 * Builds a console logger. The level is passed in rather than read from the
 * environment: `util/` is leaf code (ADR-0001), so the caller owns the
 * `process.env` read.
 *
 * @param level - Minimum level to emit. Defaults to 'info'.
 */
export function createLogger(level: LogLevel = 'info'): Required<Logger> {
  const threshold = LEVEL_ORDER[level];
  const emit =
    (at: LogLevel, write: (...args: unknown[]) => void) =>
    (message: string | Error, meta?: unknown): void => {
      if (LEVEL_ORDER[at] < threshold) return;
      if (meta === undefined) write(`[${at}]`, message);
      else write(`[${at}]`, message, meta);
    };

  return {
    debug: emit('debug', console.debug),
    info: emit('info', console.info),
    warn: emit('warn', console.warn),
    error: emit('error', console.error),
  };
}
