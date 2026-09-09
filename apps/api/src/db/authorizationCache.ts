/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/**
 * Does: Describes the bounded cache operations owned by one running API.
 * Used by: database bindings, cached lookup services, and fault-injection tests.
 */
export type AuthorizationCache = {
  namespace: string;
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  close: () => Promise<void>;
};
/** Does: Associates a cache with a database identity. Used by: database constructors. */
export type CacheBinding = { cache: AuthorizationCache; database: string };
/** Does: Identifies private transaction cache state. Used by: transaction wrappers and lookup services. */
export const cacheTransaction = Symbol('authorizationCacheTransaction');
/**
 * Does: Holds fills waiting for the enclosing database commit.
 * Used by: transaction wrappers; each transaction gets an independent instance.
 */
export type CacheTransaction = {
  [cacheTransaction]?: CacheBinding & { fills: Map<string, string> };
};
/**
 * Does: Publishes immutable lookup results after a successful commit.
 * Called by: transaction wrappers after the database transaction resolves.
 * Why: Redis failure cannot turn a committed security write into a failed operation.
 */
export async function publishCache(
  state: CacheTransaction[typeof cacheTransaction]
) {
  if (state)
    await Promise.allSettled(
      [...state.fills].map(([key, value]) => state.cache.write(key, value))
    );
}
