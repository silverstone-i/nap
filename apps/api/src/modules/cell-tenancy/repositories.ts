/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { CellTenants } from './models/CellTenants.js';
import { TenantBindings } from './models/TenantBindings.js';

/** Does: Registers module tables. Used by: cell composition. */
export const repositories = {
  cell_tenants: CellTenants,
  tenant_user_bindings: TenantBindings,
};
