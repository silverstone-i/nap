/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { createAuthV1 } from './modules/auth/apiRoutes/v1/index.js';
import type { AppConfig } from './util/appConfig.js';

/**
 * The hand-maintained route registration point (RULES/api-server.md): one
 * line per module router, mounted under `/api` by `createApp`.
 */
export function createApiRoutes(config: AppConfig): Router {
  const apiRoutes = Router();
  apiRoutes.use('/auth/v1', createAuthV1(config));
  return apiRoutes;
}
