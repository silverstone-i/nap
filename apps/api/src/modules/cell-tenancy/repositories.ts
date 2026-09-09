/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { CacheRevisions } from './models/CacheRevisions.js';
import { EntitlementProjections } from './models/EntitlementProjections.js';
import { CellTenants } from './models/CellTenants.js';
import { TenantBindings } from './models/TenantBindings.js';

/** Does: Registers module tables. Used by: cell composition. */
export const repositories = {
  cache_revisions: CacheRevisions,
  entitlement_projections: EntitlementProjections,
  cell_tenants: CellTenants,
  tenant_user_bindings: TenantBindings,
};
