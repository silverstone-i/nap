/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { CookieConfig } from './cookies.js';
import type { Argon2Params } from './passwordHash.js';

/**
 * Everything `createApp` and the routers beneath it need from the
 * environment, resolved by the entrypoint (`server.ts` is the only runtime
 * file that reads `process.env` — RULES/api-server.md).
 */
export interface AppConfig {
  /** HS256 key for the access JWT (ADR-0014). */
  accessTokenSecret: Uint8Array;
  cookies: CookieConfig;
  argon2: Argon2Params;
}
