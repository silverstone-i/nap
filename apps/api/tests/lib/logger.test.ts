/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger, parseLogLevel } from '../../src/lib/logger.js';

describe('parseLogLevel', () => {
  it('accepts each known level', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      expect(parseLogLevel(level)).toBe(level);
    }
  });

  it('returns undefined for unknown values and undefined', () => {
    expect(parseLogLevel('verbose')).toBeUndefined();
    expect(parseLogLevel('INFO')).toBeUndefined();
    expect(parseLogLevel(undefined)).toBeUndefined();
  });
});

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suppresses entries below the threshold and emits at or above it', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const logger = createLogger('warn');
    logger.debug('quiet');
    logger.info('quiet');
    logger.warn('loud');
    logger.error('loud');

    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[warn]', 'loud');
    expect(error).toHaveBeenCalledWith('[error]', 'loud');
  });

  it('defaults to the info threshold', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    const logger = createLogger();
    logger.debug('quiet');
    logger.info('loud');

    expect(debug).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[info]', 'loud');
  });

  it('appends meta only when provided', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    const logger = createLogger('info');
    logger.info('bare');
    logger.info('detailed', { requestId: 7 });

    expect(info).toHaveBeenNthCalledWith(1, '[info]', 'bare');
    expect(info).toHaveBeenNthCalledWith(2, '[info]', 'detailed', {
      requestId: 7,
    });
  });
});
