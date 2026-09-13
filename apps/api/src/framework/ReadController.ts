/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { isAdminDatabase } from '../db/admin/index.js';
import type { z } from 'zod';
import type { AdminDatabase } from '../db/admin/index.js';
import type { CellDatabase } from '../db/cell/index.js';
import type { Repositories } from './modelContract.js';

/**
 * Does: Represents the module and router a controller belongs to, which
 * name its permissions as module::router::action.
 * Used by: the controller base classes and createRouter.
 */
export type RbacConfig = { readonly module: string; readonly router: string };

/**
 * Does: Holds the database pool a controller works on together with which
 * target type: the central admin database or one assigned cell database.
 * Used by: the controller base classes, describeModel, and runOperation.
 * Why: the framework opens a tenant-scoped transaction for a cell pool and
 * a plain transaction for an admin pool (framework HTTP contract), so every
 * handler needs to know which it holds; pairing the pool with its target in
 * one value keeps the two from being mismatched.
 */
export type HandleBinding<R> =
  | { readonly target: 'cell'; readonly handle: CellDatabase<R> }
  | { readonly target: 'admin'; readonly handle: AdminDatabase<R> };

/**
 * Does: Holds the database pool and repository name a module's read routes
 * work on, plus the module and router the controller belongs to.
 * Used by: createRouter, which builds the read routes from it; a module's
 * controller class extends it, or extends WriteController for write routes.
 * Why: the controller carries configuration only. Query text, transaction
 * handling, and tenant resolution live in the framework so every module
 * answers the same way (ARCH-050). The repository is reached through the
 * transaction at request time, never through this pool. The pool may be the
 * cell database or the admin database; the binding records which. The second
 * type parameter names every repository the pool carries, so an extension
 * operation sees the module's own repository types; it defaults to the one
 * named repository.
 */
export class ReadController<
  N extends string,
  R extends Repositories<N> = Repositories<N>,
> {
  rbacConfig?: RbacConfig;
  itemSchema?: z.ZodType;
  readonly binding: HandleBinding<R>;

  constructor(
    handle: CellDatabase<R> | AdminDatabase<R>,
    readonly repository: N
  ) {
    this.binding = isAdminDatabase(handle)
      ? { target: 'admin', handle }
      : { target: 'cell', handle };
  }
}
