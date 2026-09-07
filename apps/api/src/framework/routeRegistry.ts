/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Express, Router } from 'express';
import type { CellHandle } from '../db/cell/repositories.js';

/**
 * Does: Describes one module router to mount: the module and router names
 * and version that form its path, and the factory that builds it from the
 * cell handle.
 * Used by: cellRouteRegistry and mountRoutes.
 */
export type RouteRegistration = {
  readonly module: string;
  readonly version: number;
  readonly router: string;
  readonly factory: (cellDb: CellHandle) => Router;
};

/**
 * Does: Lists every module router the API mounts against the cell handle.
 * Used by: mountRoutes at app construction.
 * Why: this is the one place routers are registered; a module adds its
 * router factory here when it ships (a composition root under ARCH-042, the
 * only file outside the database registries that may import modules). It is
 * empty until the first module is delivered, so no framework route is
 * reachable in production yet.
 */
export const cellRouteRegistry: readonly RouteRegistration[] = [];

/**
 * Does: Returns the path a registration is mounted at.
 * Called by: mountRoutes, and the registry tests.
 * Why: the framework HTTP contract fixes the shape /api/<module>/v<n>/<router>.
 */
export function mountPath(registration: RouteRegistration) {
  return `/api/${registration.module}/v${registration.version}/${registration.router}`;
}

/**
 * Does: Builds every registered router with the cell handle and mounts it on
 * the app at its path.
 * Called by: createApp, once, after the health routes and before the
 * not-found fallback.
 * @throws If two registrations share a mount path.
 */
export function mountRoutes(app: Express, handles: { cell: CellHandle }) {
  const paths = new Set<string>();
  for (const registration of cellRouteRegistry) {
    const path = mountPath(registration);
    if (paths.has(path)) throw new Error(`Duplicate route mount: ${path}`);
    paths.add(path);
    app.use(path, registration.factory(handles.cell));
  }
}
