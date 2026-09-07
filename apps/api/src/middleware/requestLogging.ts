/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { performance } from 'node:perf_hooks';
import { logger } from '../util/logger.js';
import { requestContext } from '../util/requestContext.js';
import type { RequestHandler } from 'express';

/**
 * Does: Writes one log record when a request finishes or its connection
 * closes, with the request ID, route name, status, duration, and outcome.
 * Called by: the app, second in the middleware chain, on every request.
 * Why: the record deliberately carries no URL, query string, headers, or
 * body, so nothing a client sends can land in the logs. The route is one of
 * three fixed names rather than the path for the same reason.
 */
export const requestLogging: RequestHandler = (request, response, next) => {
  const started = performance.now();
  const context = requestContext.getStore();
  let completed = false;
  const route =
    request.path === '/health/live'
      ? 'health.live'
      : request.path === '/health/ready'
        ? 'health.ready'
        : 'unmatched';
  /** Does: Emits the completion record once, whichever event fires first. */
  function complete() {
    if (completed) return;
    completed = true;
    logger.info({
      event: 'http.completed',
      requestId: context?.requestId,
      route,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - started),
      outcome: response.writableFinished ? 'finished' : 'aborted',
    });
  }
  response.once('finish', complete);
  response.once('close', complete);
  next();
};
