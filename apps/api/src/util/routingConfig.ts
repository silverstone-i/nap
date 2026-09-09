/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Does: Holds private API destinations indexed by registered deployment code.
 * Used by: the routing middleware, never returned to a customer.
 */
export type RoutingConfiguration = {
  origins: ReadonlyMap<string, string>;
  timeoutMs: number;
};

/**
 * Does: Reads the API mode and private destination origins, rejecting malformed configuration.
 * Called by: server startup and configuration tests.
 * Why: ARCH-008 keeps destinations in deployment configuration; user input cannot choose an upstream.
 */
export function routingConfiguration(
  env: NodeJS.ProcessEnv = process.env
): RoutingConfiguration | undefined {
  const mode = env.API_MODE ?? 'cell';
  if (mode === 'cell') return undefined;
  if (mode !== 'router') throw new Error('Invalid API_MODE');
  try {
    const values: unknown = JSON.parse(env.CELL_API_ORIGINS ?? '');
    if (!values || typeof values !== 'object' || Array.isArray(values))
      throw new Error();
    const origins = new Map<string, string>();
    for (const [code, value] of Object.entries(values)) {
      if (!code || code.length > 64 || typeof value !== 'string')
        throw new Error();
      const url = new URL(value);
      const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(
        url.hostname
      );
      if (
        (url.protocol !== 'https:' &&
          !(
            url.protocol === 'http:' &&
            loopback &&
            env.NODE_ENV !== 'production'
          )) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new Error();
      if ([...origins.values()].includes(url.origin)) throw new Error();
      origins.set(code, url.origin);
    }
    if (!origins.size) throw new Error();
    return { origins, timeoutMs: 30000 };
  } catch {
    throw new Error('Invalid CELL_API_ORIGINS');
  }
}
