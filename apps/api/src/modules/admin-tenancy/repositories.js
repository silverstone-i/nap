/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Cells } from './models/cells.js';
import { Tenants } from './models/tenants.js';
import { PortalUsers } from './models/portal_users.js';
import { PortalUserTenants } from './models/portal_user_tenants.js';
import { Sessions } from './models/sessions.js';
import { LoginThrottles } from './models/login_throttles.js';
import { PlatformRoles } from './models/platform_roles.js';
import { CellProvisioning } from './models/cell_provisioning.js';
import { ProvisioningJobs } from './models/provisioning_jobs.js';
import { ModuleEntitlements } from './models/module_entitlements.js';
import { CacheRevisions } from './models/cache_revisions.js';
import { ManagedEvents } from './models/managed_events.js';

export const repositories = {
  cells: Cells,
  tenants: Tenants,
  portal_users: PortalUsers,
  portal_user_tenants: PortalUserTenants,
  sessions: Sessions,
  login_throttles: LoginThrottles,
  platform_roles: PlatformRoles,
  cell_provisioning: CellProvisioning,
  provisioning_jobs: ProvisioningJobs,
  module_entitlements: ModuleEntitlements,
  cache_revisions: CacheRevisions,
  managed_events: ManagedEvents,
};
