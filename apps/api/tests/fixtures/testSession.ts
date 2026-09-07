/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { standardActions } from '../../src/framework/createRouter.js';
import type { RequestHandler } from 'express';
import type { ResolvedSession } from '../../src/middleware/session.js';

/**
 * Does: Builds middleware that stores the given session on every response,
 * standing in for the resolver the authentication capability will install.
 * Called by: framework tests when they build an app.
 */
export function withSession(session?: ResolvedSession): RequestHandler {
  return (_request, response, next) => {
    if (session) response.locals.session = session;
    next();
  };
}

/**
 * Does: Builds a session entitled to the fixture module and holding every
 * standard permission of the fixture router, plus any extra actions given.
 * Called by: framework tests.
 */
export function fullSession(
  tenantId: string | undefined,
  actorId: string,
  extraActions: readonly string[] = []
): ResolvedSession {
  return {
    actorId,
    ...(tenantId === undefined ? {} : { tenantId }),
    entitlements: new Set(['fixture']),
    permissions: new Set(
      [...standardActions, ...extraActions].map(
        action => `fixture::records::${action}`
      )
    ),
  };
}
