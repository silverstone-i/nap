/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Does: Holds the current request ID and the identity verified by authentication.
 * Used by: correlation, session resolution, logging, and the database actor resolver.
 * Why: actorId is populated only after server-side verification (AUTH-008).
 */
export const requestContext = new AsyncLocalStorage<{
  requestId: string;
  actorId?: string;
}>();
