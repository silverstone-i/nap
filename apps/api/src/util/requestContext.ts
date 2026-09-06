/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** Execution identity only; never an actor, tenant, or authorization source. */
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
