/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { resolveSession } from '../services/sessions.js';
import type { AdminHandle } from '../db/admin/repositories.js';
import type { AuthConfiguration } from '../util/authConfig.js';
import type { RequestHandler } from 'express';

/**
 * Does: Builds middleware that attaches a database-verified session to each cookie-bearing request.
 * Called by: the app after correlation and before body parsing.
 */
export function sessionResolver(
  db: AdminHandle,
  config: AuthConfiguration
): RequestHandler {
  return async (request, response, next) => {
    if (
      request.headers.cookie ||
      request.path.startsWith('/api/admin-tenancy/v1/auth')
    )
      response.setHeader('Cache-Control', 'no-store');
    const result = await resolveSession(db, request.headers.cookie, config);
    if (result?.session) response.locals.session = result.session;
    if (result?.presented) response.locals.presentedSession = result.presented;
    next();
  };
}
