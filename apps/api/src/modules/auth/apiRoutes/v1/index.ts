/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { requireAuth } from '../../../../middleware/requireAuth.js';
import type { AppConfig } from '../../../../util/appConfig.js';
import { createAuthController } from '../../controllers/authController.js';

/**
 * The auth router is hand-written, not factory-generated: no route demands a
 * permission cell, and the mutating-verb-to-level mapping of
 * RULES/api-standard-routes.md does not apply (PRD 0004). Login and refresh
 * are unauthenticated by nature; the rest require a valid access token — a
 * session's owner may always manage that session.
 */
export function createAuthV1(config: AppConfig): Router {
  const controller = createAuthController(config);
  const authed = requireAuth(config.accessTokenSecret);
  const router = Router();

  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', authed, controller.logout);
  router.post('/switch-tenant', authed, controller.switchTenant);
  router.put('/password', authed, controller.changePassword);
  router.put('/idle-window', authed, controller.setIdleWindow);

  return router;
}
