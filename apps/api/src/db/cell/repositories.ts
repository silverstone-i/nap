/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { repositories as projects } from '../../modules/projects/repositories.js';
import { repositories as core } from '../../modules/core/repositories.js';
import { repositories as tenancy } from '../../modules/cell-tenancy/repositories.js';
import type { RepositoryCtor, RepositoryInstances } from 'pg-schemata';
import type { CellDatabase } from './index.js';

/**
 * Does: Lists every repository class registered on the runtime cell handle,
 * keyed by the name the framework controllers use to reach it.
 * Used by: server startup when it creates the cell handle, and the framework
 * router factory through the handle's type.
 * Why: this is the one place cell repositories are registered; a module adds
 * its models here when it ships (a composition root under ARCH-042). It is
 * empty until the first cell module is delivered.
 */
export const cellRepositories = {
  ...tenancy,
  ...core,
  ...projects,
} satisfies Record<string, RepositoryCtor>;

/**
 * Does: Represents the repositories the runtime cell handle carries.
 * Used by: CellHandle.
 */
export type CellRepositories = RepositoryInstances<typeof cellRepositories>;

/**
 * Does: Types the runtime cell handle, carrying the registered repositories.
 * Used by: the runtime, the app, and the route registry.
 */
export type CellHandle = CellDatabase<CellRepositories>;
