/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import controlRouter from '../modules/admin-tenancy/apiRoutes/v1/control.js';
import identityRouter from '../modules/core/apiRoutes/v1/identity.js';
import authRouter from '../modules/admin-tenancy/apiRoutes/v1/auth.js';
import { authConfiguration } from '../util/authConfig.js';
import type { AuthConfiguration } from '../util/authConfig.js';
import type { Express, Router } from 'express';
import type { AdminHandle } from '../db/admin/repositories.js';
import type { CellHandle } from '../db/cell/repositories.js';

/**
 * Does: Describes one module router to mount: the module and router names
 * and version that form its path, which database it is bound to, and the
 * factory that builds it from that database's pool.
 * Used by: routeRegistry and mountRoutes.
 * Why: the target decides which pool the factory receives, so a router
 * written against admin repositories can never be handed the cell pool, or
 * the reverse (framework HTTP contract).
 */
export type RouteRegistration = {
  readonly module: string;
  readonly version: number;
  readonly router: string;
} & (
  | { readonly target: 'cell'; readonly factory: (db: CellHandle) => Router }
  | {
      readonly target: 'admin';
      readonly factory: (
        db: AdminHandle,
        config: AuthConfiguration,
        cell: CellHandle
      ) => Router;
    }
);

/**
 * Does: Lists every module router the API mounts, against the cell pool or
 * the admin pool.
 * Used by: mountRoutes at app construction.
 * Why: this is the one place routers are registered; a module adds its
 * router factory here when it ships (a composition root under ARCH-042, the
 * only file outside the database registries that may import modules). Authentication is the first production router.
 */
export const routeRegistry: readonly RouteRegistration[] = [
  {
    module: 'admin-tenancy',
    version: 1,
    router: 'control',
    target: 'admin',
    factory: controlRouter,
  },
  {
    module: 'core',
    version: 1,
    router: 'identity',
    target: 'cell',
    factory: identityRouter,
  },
  {
    module: 'admin-tenancy',
    version: 1,
    router: 'auth',
    target: 'admin',
    factory: authRouter,
  },
];

/**
 * Does: Returns the path a registration is mounted at.
 * Called by: mountRoutes, and the registry tests.
 * Why: the framework HTTP contract fixes the shape /api/<module>/v<n>/<router>.
 */
export function mountPath(registration: RouteRegistration) {
  return `/api/${registration.module}/v${registration.version}/${registration.router}`;
}

/**
 * Does: Builds every registered router with the pool its target names and
 * mounts it on the app at its path.
 * Called by: createApp, once, after the health routes and before the
 * not-found fallback.
 * @throws If two registrations share a mount path.
 */
export function mountRoutes(
  app: Express,
  handles: { admin: AdminHandle; cell: CellHandle },
  config: AuthConfiguration = authConfiguration()
) {
  const paths = new Set<string>();
  for (const registration of routeRegistry) {
    const path = mountPath(registration);
    if (paths.has(path)) throw new Error(`Duplicate route mount: ${path}`);
    paths.add(path);
    const router =
      registration.target === 'admin'
        ? registration.factory(handles.admin, config, handles.cell)
        : registration.factory(handles.cell);
    app.use(path, router);
  }
}
