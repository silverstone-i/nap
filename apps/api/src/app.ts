/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express, { type Express } from 'express';

/**
 * Builds the API application without binding a port, so tests can drive it
 * through Supertest and server.ts owns the listen call.
 */
export function createApp(): Express {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
