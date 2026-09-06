/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';

/**
 * Construct the startup scaffold without opening a listener or a database.
 * Tests can import it without process lifecycle side effects. Until feature
 * routes are implemented, every request receives an empty 404 response.
 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response) => {
    response.status(404).end();
  });
  return app;
}
