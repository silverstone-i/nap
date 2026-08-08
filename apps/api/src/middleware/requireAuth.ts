/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { RequestHandler } from 'express';
import { ACCESS_COOKIE } from '../util/cookies.js';
import { verifyAccessToken } from '../util/tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth after access-token verification. */
      auth?: { userId: string };
    }
  }
}

/**
 * Verifies the access JWT from the `nap_access` cookie and attaches
 * `req.auth`. Purely computational — no database — so protected routes
 * refuse unauthenticated calls even without one (ADR-0014: the database
 * touch is confined to the refresh call). No RBAC here: a valid token is
 * all these session-owner routes demand (PRD 0004).
 */
export function requireAuth(secret: Uint8Array): RequestHandler {
  return async (req, res, next) => {
    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies[ACCESS_COOKIE];
    const verified =
      token === undefined ? null : await verifyAccessToken(token, secret);
    if (verified === null) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.auth = { userId: verified.userId };
    next();
  };
}
