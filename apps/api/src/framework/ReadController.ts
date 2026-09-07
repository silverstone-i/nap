/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { z } from 'zod';
import type { CellDatabase } from '../db/cell/index.js';
import type { Repositories } from './modelContract.js';

/**
 * Does: Represents the module and router a controller belongs to, which
 * name its permissions as module::router::action.
 * Used by: the controller base classes and createRouter.
 */
export type RbacConfig = { readonly module: string; readonly router: string };

/**
 * Does: Holds the cell handle and repository name a module's read routes
 * work on, plus the module and router the controller belongs to.
 * Used by: createRouter, which builds the read routes from it; a module's
 * controller class extends it, or extends WriteController for write routes.
 * Why: the controller carries configuration only. Query text, transaction
 * handling, and tenant resolution live in the framework so every module
 * answers the same way (ARCH-050). The repository is reached through the
 * tenant transaction at request time, never through this handle. The second
 * type parameter names every repository the handle carries, so an extension
 * operation sees the module's own repository types; it defaults to the one
 * named repository.
 */
export class ReadController<
  N extends string,
  R extends Repositories<N> = Repositories<N>,
> {
  rbacConfig?: RbacConfig;
  itemSchema?: z.ZodType;

  constructor(
    readonly cellDb: CellDatabase<R>,
    readonly repository: N
  ) {}
}
