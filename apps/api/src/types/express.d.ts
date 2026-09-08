/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ResolvedSession } from '../middleware/session.js';

declare global {
  namespace Express {
    /**
     * Does: Adds the two request-scoped values the API stores on
     * response.locals: the server-resolved session and the route label.
     * Used by: the session gates, the framework router, and request logging.
     * Why: response.locals lives for one response only, so a session or
     * label set here cannot leak into another request; the request context carries the request ID and verified audit actor.
     */
    interface Locals {
      session?: ResolvedSession;
      presentedSession?: { id: string; actorId: string };
      route?: string;
    }
  }
}
