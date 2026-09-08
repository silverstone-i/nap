/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { RepositoryCtor, RepositoryInstances } from 'pg-schemata';
import type { AdminDatabase } from './index.js';

/**
 * Does: Lists every repository class registered on the runtime admin handle,
 * keyed by the name the framework controllers use to reach it.
 * Used by: server startup when it creates the admin handle, and the
 * framework router factory through the handle's type.
 * Why: this is the one place admin repositories are registered; a module
 * adds its models here when it ships (a composition root under ARCH-042). It
 * is empty until the first admin module is delivered.
 */
export const adminRepositories = {} satisfies Record<string, RepositoryCtor>;

/**
 * Does: Represents the repositories the runtime admin handle carries.
 * Used by: AdminHandle.
 */
export type AdminRepositories = RepositoryInstances<typeof adminRepositories>;

/**
 * Does: Types the runtime admin handle, carrying the registered repositories.
 * Used by: the runtime, the app, and the route registry.
 */
export type AdminHandle = AdminDatabase<AdminRepositories>;
