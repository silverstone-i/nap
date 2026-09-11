/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
let generation = 0;
const listeners = new Set<(code: 'UNAUTHENTICATED' | 'FORBIDDEN') => void>();
/**
 * Does: Returns the active request generation.
 * Called by: transport before and after requests.
 */
export function requestGeneration() {
  return generation;
}
/**
 * Does: Makes pending replies obsolete.
 * Called by: session changes and access refusals.
 */
export function invalidateRequests() {
  generation += 1;
}
/**
 * Does: Subscribes to server access refusals.
 * Called by: the session provider on mount.
 */
export function subscribeRefusals(
  listener: (code: 'UNAUTHENTICATED' | 'FORBIDDEN') => void
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/**
 * Does: Clears pending replies and reports a current access refusal.
 * Called by: checked transport responses.
 */
export function reportRefusal(code: 'UNAUTHENTICATED' | 'FORBIDDEN') {
  invalidateRequests();
  for (const listener of listeners) listener(code);
}
