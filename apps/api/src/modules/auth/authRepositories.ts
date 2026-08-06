/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { NapModule } from '../../db/index.js';
import { ImpersonationLogs } from './models/ImpersonationLogs.js';
import { PortalUsers } from './models/PortalUsers.js';
import { PortalUserTenants } from './models/PortalUserTenants.js';

declare module 'pg-schemata' {
  interface Repositories {
    portalUsers: PortalUsers;
    portalUserTenants: PortalUserTenants;
    impersonationLogs: ImpersonationLogs;
  }
}

/** Registry descriptor for the auth module (ADR-0001, ADR-0004, ADR-0005). */
export const authModule: NapModule = {
  name: 'auth',
  schemaScope: 'admin',
  licensable: false,
  models: {
    portalUsers: PortalUsers,
    portalUserTenants: PortalUserTenants,
    impersonationLogs: ImpersonationLogs,
  },
  migrations: [],
};
