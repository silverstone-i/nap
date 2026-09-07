/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Does: Holds the ID of the request currently being handled, so any code
 * running for that request can read it without being passed it.
 * Used by: the correlation middleware to set it, and the logger and request
 * logging middleware to read it.
 * Why: it carries the request ID and nothing else. It must never be used to
 * find out who the caller is, which tenant they belong to, or what they are
 * allowed to do; those come from server-resolved data, not request scope.
 */
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
