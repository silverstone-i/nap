/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Tenants } from './models/Tenants.js';
import { PortalUsers } from './models/PortalUsers.js';
import { PortalUserTenants } from './models/PortalUserTenants.js';
import { Sessions } from './models/Sessions.js';
import { LoginThrottles } from './models/LoginThrottles.js';

/**
 * Does: Lists the five authentication repository constructors.
 * Used by: the admin registry and module descriptor.
 */
export const repositories = {
  cells: Cells,
  platform_grants: PlatformGrants,
  provisioning_jobs: ProvisioningJobs,
  managed_events: ManagedEvents,

  tenants: Tenants,
  portal_users: PortalUsers,
  portal_user_tenants: PortalUserTenants,
  sessions: Sessions,
  login_throttles: LoginThrottles,
};

import { Cells } from './models/Cells.js';
import { PlatformGrants } from './models/PlatformGrants.js';
import { ProvisioningJobs } from './models/ProvisioningJobs.js';
import { ManagedEvents } from './models/ManagedEvents.js';
