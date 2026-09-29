/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The restoration decision (I0001-R003 and the PRD §8 lifecycle
 * table), factored out as a pure function so it can be tested against every
 * lifecycle row without mounting the app.
 */

/**
 * @param {{status: string, session?: {restricted?: boolean}|null, selectedTenant?: object|null, entryPoints?: {tenant?: boolean}|null, management?: boolean}} state
 * @returns {string|null} The route to enter, or `null` when nothing is
 *   available (the "no access" case: an authenticated user with neither a
 *   tenant nor platform entry).
 */
export function deriveDestination(state) {
  if (state.status === 'restricted') return '/password';
  if (state.status !== 'ready') return null;
  // I0001-R003: a selected tenant restores into Home; otherwise a user with
  // eligible tenants picks one first, management access included. Management
  // alone still reaches Home, which serves it with no tenant selected.
  if (state.selectedTenant) return '/home';
  if (state.entryPoints?.tenant) return '/tenants';
  if (state.management) return '/home';
  return null;
}
