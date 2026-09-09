/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { EntitlementProjections } from './models/EntitlementProjections.js';
import { CellTenants } from './models/CellTenants.js';
import { TenantBindings } from './models/TenantBindings.js';

/** Does: Registers module tables. Used by: cell composition. */
export const repositories = {
  entitlement_projections: EntitlementProjections,
  cell_tenants: CellTenants,
  tenant_user_bindings: TenantBindings,
};
