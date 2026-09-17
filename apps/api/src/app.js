/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import { healthResponse, notFoundResponse } from '@nap/shared';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health/live', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json(healthResponse);
  });

  app.use((_request, response) => {
    response.status(404).json(notFoundResponse);
  });

  return app;
}
