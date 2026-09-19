/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { healthResponse, notFoundResponse } from '@nap/shared';

export function createApp({ webRoot, trustProxyHops = 0, isReady } = {}) {
  if (
    !Number.isInteger(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 16
  )
    throw new Error('Invalid proxy hop count');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  app.get('/health/live', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json(healthResponse);
  });
  if (isReady)
    app.get('/health/ready', async (_request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      let ready = false;
      try {
        ready = await isReady();
      } catch {
        /* Readiness failures use the same safe response. */
      }
      response.status(ready ? 200 : 503).json(
        ready
          ? healthResponse
          : {
              version: 1,
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Service unavailable',
              },
            }
      );
    });
  if (webRoot) {
    const directory = resolve(webRoot);
    const entry = resolve(directory, 'index.html');
    if (!statSync(entry, { throwIfNoEntry: false })?.isFile())
      throw new Error('Built web client is unavailable');
    const assets = express.static(directory, {
      index: false,
      dotfiles: 'ignore',
    });
    const reserved = path => /^\/(?:api|health)(?:\/|$)/.test(path);
    app.use((request, response, next) => {
      if (reserved(request.path)) return next();
      assets(request, response, next);
    });
    app.use((request, response, next) => {
      if (
        !['GET', 'HEAD'].includes(request.method) ||
        reserved(request.path) ||
        request.path.includes('.') ||
        !request.accepts('html')
      )
        return next();
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(entry, error => {
        if (error) next(error);
      });
    });
  }
  app.use((_request, response) => response.status(404).json(notFoundResponse));
  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    response.status(500).json({
      version: 1,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });
  });
  return app;
}
