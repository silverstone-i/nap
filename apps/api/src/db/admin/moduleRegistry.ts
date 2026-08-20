/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ModuleDescriptor, RepositoryCtor } from 'pg-schemata';

/**
 * Admin-targeted module registry.
 *
 * The central administration database owns identity, session, tenant,
 * membership, cell, and tenant-to-cell records (ARCH-005) and holds no tenant
 * business data (ARCH-006). Modules whose descriptor sets
 * `databaseTarget: 'admin'` register here and nowhere else.
 *
 * Phase 1 establishes the composition root only; the registries are populated
 * by the Phase 2 control-plane modules.
 */

/** The one physical schema the central administration database uses. */
export const ADMIN_SCHEMA = 'admin';

/** Repository constructors attached to the admin handle. */
export const adminRepositories = {} satisfies Record<string, RepositoryCtor>;

/** Ordered admin-targeted migration modules. */
export const adminModules: ModuleDescriptor[] = [];
