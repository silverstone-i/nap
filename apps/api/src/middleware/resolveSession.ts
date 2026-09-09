/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { cachedProjections } from '../services/cachedSecurityState.js';
import { tenantCapabilities } from '../services/authorization.js';
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import type { CellHandle } from '../db/cell/repositories.js';
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
  config: AuthConfiguration,
  cell?: CellHandle
): RequestHandler {
  return async (request, response, next) => {
    if (
      request.headers.cookie ||
      request.path.startsWith('/api/admin-tenancy/v1/auth')
    )
      response.setHeader('Cache-Control', 'no-store');
    const result = await resolveSession(db, request.headers.cookie, config);
    if (result?.session) {
      const session = result.session;
      if (cell && session.tenantId)
        await withTenantTransaction(cell, session.tenantId, async tx => {
          session.permissions = await tenantCapabilities(tx, session);
          const projections = await cachedProjections(tx, session.tenantId!);
          for (const grant of session.entitlementState)
            if (
              grant.enabled &&
              projections.some(
                p =>
                  p.module === grant.module &&
                  p.enabled &&
                  p.revision === grant.revision
              )
            )
              session.entitlements.add(grant.module);
        });
      response.locals.session = session;
    }
    if (result?.presented) response.locals.presentedSession = result.presented;
    next();
  };
}
