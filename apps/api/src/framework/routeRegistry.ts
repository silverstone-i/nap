/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import {
  accessCatalog,
  businessPermissions,
} from '../services/accessCatalog.js';
import { databaseUnavailable } from '../util/databaseUnavailable.js';
import { authorizeCell } from '../middleware/cellAuthorization.js';
import { HttpError } from '../util/httpError.js';
import type { CellRegistry } from '../services/cellRegistry.js';
import { routerAuthorization } from './createRouter.js';
import { cellModules } from '../db/cell/modules.js';
import projectsRouter from '../modules/projects/apiRoutes/v1/projects.js';
import accessRouter from '../modules/core/apiRoutes/v1/access.js';
import companiesRouter from '../modules/core/apiRoutes/v1/companies.js';
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
        cells: CellRegistry
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
    module: 'projects',
    router: 'projects',
    version: 1,
    target: 'cell',
    factory: projectsRouter,
  },
  {
    module: 'core',
    router: 'access',
    version: 1,
    target: 'cell',
    factory: accessRouter,
  },
  {
    module: 'core',
    router: 'companies',
    version: 1,
    target: 'cell',
    factory: companiesRouter,
  },
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
  handles: { admin: AdminHandle; cells: CellRegistry },
  config: AuthConfiguration = authConfiguration()
) {
  const paths = new Set<string>();
  for (const registration of routeRegistry) {
    if (registration.target === 'cell') {
      const descriptor = cellModules.find(m => m.name === registration.module);
      if (!descriptor || descriptor.entitlement === 'infrastructure')
        throw new Error('Business router lacks module entitlement policy');
    }
    const path = mountPath(registration);
    if (paths.has(path)) throw new Error(`Duplicate route mount: ${path}`);
    paths.add(path);
    if (registration.target === 'admin') {
      app.use(path, registration.factory(handles.admin, config, handles.cells));
      continue;
    }
    const routers = new Map<string, Router>();
    for (const [id, cell] of handles.cells.handles) {
      const router = registration.factory(cell);
      {
        const policy = routerAuthorization(router);
        const resource = accessCatalog.find(
          r => r.resource === policy?.resource
        );
        const special = ['core::identity', 'core::access'].includes(
          policy?.resource ?? ''
        );
        if (
          !policy ||
          policy.module !== registration.module ||
          policy.resource !==
            `${registration.module}::${registration.router}` ||
          policy.capabilities.some(c => !businessPermissions.includes(c)) ||
          (!special && (!resource || !policy.scoped)) ||
          (resource &&
            resource.fields
              .flatMap(f => f.columns)
              .some(c => !policy.protectedFields.includes(c)))
        )
          throw new Error(
            'Business router lacks a registered authorization contract'
          );
      }
      routers.set(id, router);
    }
    app.use(path, async (request, response, next) => {
      const session = response.locals.session;
      if (!session) throw new HttpError('UNAUTHENTICATED');
      if (!session.tenantId || !session.cellId)
        throw new HttpError('FORBIDDEN');
      const cell = handles.cells.get(session.cellId);
      const router = routers.get(session.cellId);
      if (!router) throw new HttpError('SERVICE_UNAVAILABLE');
      try {
        response.locals.session = await authorizeCell(cell, session);
      } catch (error) {
        if (databaseUnavailable(error))
          throw new HttpError('SERVICE_UNAVAILABLE');
        throw error;
      }
      router(request, response, next);
    });
  }
}
