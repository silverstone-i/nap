/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response) => {
    response.status(404).end();
  });
  return app;
}
