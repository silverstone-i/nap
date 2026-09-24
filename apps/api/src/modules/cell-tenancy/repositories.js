/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { PhysicalIdentity } from './models/physical_identity.js';
import { Tenants } from './models/tenants.js';
import { TenantMembers } from './models/tenant_members.js';
import { ModuleEntitlements } from './models/module_entitlements.js';
import { Outbox } from './models/outbox.js';

/** Table name to model class map used to build cell database repositories. */
export const repositories = {
  physical_identity: PhysicalIdentity,
  tenants: Tenants,
  tenant_members: TenantMembers,
  module_entitlements: ModuleEntitlements,
  outbox: Outbox,
};
