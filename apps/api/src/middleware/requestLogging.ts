/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { performance } from 'node:perf_hooks';
import { logger } from '../util/logger.js';
import { requestContext } from '../util/requestContext.js';
import type { RequestHandler } from 'express';

/** Emit one completion record without raw URL, query, header, or payload fields. */
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
